"""The Shell page's WinRM session, on pypsrp (see winrm_helper.py). Same behaviour as winrm-shell.ps1: one persistent remote PowerShell
session (so the current folder and variables survive between commands), a command per line on stdin, the result and a new prompt on stdout.
There is no real terminal here: full-screen programs and prompts for input do not work.

Besides typed commands the server sends control lines (they start with character 1) for the Send file / Pull file buttons: ls (list a remote
folder), get (copy a remote file here) and put (copy a local file to the remote host). Answers go back as a hidden marker
(ESC ] 7778 ; id ; base64-json BEL) and the current folder is reported before each prompt as ESC ] 7777 ; path BEL; the server strips both
before the browser sees them.
"""
import base64
import json
import os
import sys

from pypsrp.powershell import PowerShell, RunspacePool
from pypsrp.complex_objects import PSInvocationState

E = os.environ
ESC, BEL = "\x1b", "\x07"

sys.stdin.reconfigure(encoding="utf-8", errors="replace")

LISTING = """
param($path)
if ([string]::IsNullOrEmpty($path)) {
    Get-PSDrive -PSProvider FileSystem | ForEach-Object { [pscustomobject]@{ name = "$($_.Name):\\"; dir = $true; size = $null; modified = $null } }
} else {
    Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop | ForEach-Object {
        [pscustomobject]@{ name = $_.Name; dir = [bool]$_.PSIsContainer; size = $(if ($_.PSIsContainer) { $null } else { $_.Length }); modified = $_.LastWriteTimeUtc.ToString('o') }
    }
}
"""


def say(text):
    sys.stdout.write(text)
    sys.stdout.flush()


def marker(code, text):
    say("%s]%s;%s%s" % (ESC, code, text, BEL))


def reply(cid, obj):
    marker(7778, "%s;%s" % (cid, base64.b64encode(json.dumps(obj).encode("utf-8")).decode("ascii")))


def ps_quote(v):
    return "'" + str(v).replace("'", "''") + "'"


def run(pool, script, width=200, info=True):
    ps = PowerShell(pool)
    ps.add_script(script)
    ps.add_cmdlet("Out-String").add_parameter("Width", width)
    out = "".join(o if isinstance(o, str) else str(o) for o in ps.invoke())
    if info:
        for rec in ps.streams.information:
            m = getattr(rec, "message_data", None)
            if m is not None:
                out += str(m).rstrip("\r\n") + "\r\n"
    errs = [str(e) for e in ps.streams.error]
    return out, errs, ps.state == PSInvocationState.FAILED


def first_line(e):
    t = str(e).strip()
    return t.splitlines()[0] if t else type(e).__name__


def control(client, pool, line):
    parts = line[1:].split("\t")
    op, cid = parts[0], parts[1]
    try:
        a = json.loads(base64.b64decode(parts[2]).decode("utf-8"))
        if op == "ls":
            out, errs, failed = run(pool, "$__r = @(& { %s } %s); ConvertTo-Json -InputObject $__r -Compress" % (LISTING, ps_quote(a.get("path") or "")), 1000000, False)
            if failed:
                raise RuntimeError(errs[-1] if errs else "could not list the folder")
            entries = json.loads(out.strip() or "[]")
            reply(cid, {"ok": True, "entries": entries if isinstance(entries, list) else [entries]})
        elif op == "get":
            client.fetch(a["remote"], a["local"])
            reply(cid, {"ok": True})
        elif op == "put":
            run(pool, "New-Item -ItemType Directory -Force -Path %s | Out-Null" % ps_quote(a["remoteDir"]))
            client.copy(a["local"], a["remote"])
            reply(cid, {"ok": True})
        else:
            reply(cid, {"ok": False, "error": "Unknown operation " + op})
    except Exception as e:
        reply(cid, {"ok": False, "error": first_line(e)})


def run_shell(client):
    host = E.get("KB_HOST", "")
    try:
        pool = RunspacePool(client.wsman)
        pool.open()
    except Exception as e:
        say("Connection failed: %s\r\n" % first_line(e))
        return 1
    say("Connected to %s. Type a command and press Enter; 'exit' closes the shell.\r\n\r\n" % host)
    try:
        quiet = False
        while True:
            if not quiet:
                try:
                    where = run(pool, "(Get-Location).Path", 200, False)[0].strip() or "?"
                except Exception:
                    where = "?"
                marker(7777, where)
                say("[%s]: PS %s> " % (host, where))
            quiet = False
            line = sys.stdin.readline()
            if line == "":
                break
            line = line.rstrip("\r\n")
            if line[:1] == "\x01":  # control line from the server, not typed by the user
                quiet = True
                control(client, pool, line)
                continue
            cmd = line.strip()
            if cmd == "":
                say("\r\n")
                continue
            if cmd in ("exit", "quit"):
                break
            try:
                encoded = base64.b64encode(line.encode("utf-8")).decode("ascii")
                # dot-sourced so variables and the current folder persist from one command to the next
                out, errs, failed = run(pool, "$__l = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s')); . ([scriptblock]::Create($__l)) 2>&1" % encoded)
                text = out.rstrip()
                if errs:
                    text = (text + "\r\n" if text else "") + "\r\n".join(errs)
                say((text.replace("\r\n", "\n").replace("\n", "\r\n") + "\r\n") if text else "\r\n")
            except Exception as e:
                say(first_line(e) + "\r\n")
    finally:
        try:
            pool.close()
        except Exception:
            pass
    say("\r\nConnection closed.\r\n")
    return 0
