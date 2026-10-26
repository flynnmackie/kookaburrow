"""WinRM engine for Kookaburrow, built on pypsrp (the library KingfishIR uses).

Started by src/remote/winrm.js (and src/shell.js for the shell) from the bundled Python in vendor/winrm-runtime. It does the same jobs
as winrm-run.ps1 and winrm-shell.ps1, which are the fallback when the bundled engine is not installed, and it answers the same way:
what the job produced on stdout, errors on stderr, and the exit code (0 worked, 1 failed, 2 could not connect).

Why this one: pypsrp speaks the WinRM protocol itself with NTLM and message encryption (sealing) over plain HTTP on 5985, so neither this
server nor the targets need any configuration (no TrustedHosts, no AllowUnencrypted, no client WinRM service).

The target, credentials and job arrive in environment variables, never on the command line:
  KB_HOST KB_PORT KB_USER KB_PASS KB_AUTH KB_SSL   where to connect (KB_SSL=1 for HTTPS)
  KB_MODE      probe | script | smb-open | smb-list | smb-close | stage-clean | shell
  KB_SCRIPT    script mode: the local .ps1 file to run on the target
  KB_CSV       script mode: 1 = return what the script emitted as CSV (hunts)
  KB_BINS      script mode: JSON list of local files to copy to a temporary folder on the target, exposed to the script as $BinDir
  KB_STAGE     script mode: name of that temporary folder (so the server can remove it if the run is cancelled)
  KB_OUTDIR    script mode: folder the script writes large files to, exposed as $OutDir
  KB_ARG       the other modes: JSON request
"""
import base64
import json
import os
import re
import sys
import traceback
import uuid

sys.stdout.reconfigure(encoding="utf-8", errors="replace", newline="\n")
sys.stderr.reconfigure(encoding="utf-8", errors="replace", newline="\n")

from pypsrp.client import Client  # noqa: E402
from pypsrp.exceptions import AuthenticationError, WinRMTransportError, WSManFaultError  # noqa: E402
from pypsrp.powershell import PowerShell, RunspacePool  # noqa: E402
from pypsrp.complex_objects import PSInvocationState  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
E = os.environ


class Failed(Exception):
    """A job that ran but did not work: its message goes to stderr, exit code 1."""


def connect():
    ssl = E.get("KB_SSL") == "1"
    auth = (E.get("KB_AUTH") or "Negotiate").lower()
    port = int(E.get("KB_PORT") or (5986 if ssl else 5985))
    return Client(
        E["KB_HOST"], username=E["KB_USER"], password=E["KB_PASS"], port=port, ssl=ssl,
        auth=auth, cert_validation=False,
        # message-level encryption over plain HTTP, the same as KingfishIR; HTTPS is already encrypted
        encryption="auto" if ssl else "always",
        connection_timeout=20, operation_timeout=60, read_timeout=120,
    )


def b64(text):
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def ps_quote(v):
    return "'" + str(v).replace("'", "''") + "'"


def text_of(o):
    return o if isinstance(o, str) else str(o)


def run_ps(pool, script, width=4096, merge_info=True):
    """Runs a script in an open runspace. Returns (stdout, stderr, failed). Variables set by earlier calls on the same pool persist."""
    ps = PowerShell(pool)
    ps.add_script(script)
    ps.add_cmdlet("Out-String").add_parameter("Width", width)
    out = ps.invoke()
    stdout = "".join(text_of(o) for o in out)
    if merge_info:
        # Write-Host output comes back on its own stream; keep it with the rest of what the script printed
        for rec in ps.streams.information:
            m = getattr(rec, "message_data", None)
            if m is not None:
                stdout += text_of(m).rstrip("\r\n") + "\r\n"
    errs = "\n".join(text_of(e) for e in ps.streams.error)
    return stdout, errs, ps.state == PSInvocationState.FAILED


def one_shot(client, script, width=4096):
    with RunspacePool(client.wsman) as pool:
        return run_ps(pool, script, width)


def with_arg(file_name, arg):
    with open(os.path.join(HERE, "ps", file_name), encoding="utf-8") as f:
        return "$arg = " + ps_quote(json.dumps(arg)) + " | ConvertFrom-Json\n" + f.read()


CSV_WRAPPER = """
$__body = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('%s'))
function Format-Table { $input }
function Format-List { $input }
$items = @(& ([scriptblock]::Create($__body)))
$text = @($items | Where-Object { $_ -is [string] })
if ($items.Count -gt 0 -and $text.Count -eq 0) { $items | ConvertTo-Csv -NoTypeInformation }
else { $items | ForEach-Object { [pscustomobject]@{ Output = ([string]$_).TrimEnd() } } | ConvertTo-Csv -NoTypeInformation }
"""


def mode_probe(client):
    out, err, failed = one_shot(client, '$o = Get-CimInstance Win32_OperatingSystem; '
                                        '[pscustomobject]@{ hostname = $env:COMPUTERNAME; os = $o.Caption; version = $o.Version } | ConvertTo-Json -Compress')
    if failed or not out.strip():
        raise Failed(err or "the host did not answer the probe")
    print(out.strip())


def mode_script(client):
    csv = E.get("KB_CSV") == "1"
    with open(E["KB_SCRIPT"], encoding="utf-8-sig") as f:
        body = f.read()
    bins = json.loads(E["KB_BINS"]) if E.get("KB_BINS") else []
    out_dir = E.get("KB_OUTDIR", "")
    script = (CSV_WRAPPER % b64(body)) if csv else body
    width = 8192 if csv else 4096
    stage = None
    with RunspacePool(client.wsman) as pool:
        try:
            if bins:
                name = E.get("KB_STAGE") or ("kb-" + uuid.uuid4().hex[:16])
                if not re.fullmatch(r"kb-[0-9a-f]{16}", name):
                    raise Failed("invalid staging folder name")
                stage, err, failed = run_ps(pool, "$d = Join-Path ([System.IO.Path]::GetTempPath()) %s; New-Item -ItemType Directory -Path $d -Force | Out-Null; $d" % ps_quote(name))
                stage = stage.strip()
                if failed or not stage:
                    raise Failed(err or "could not create the staging folder on the host")
                for local in bins:
                    client.copy(local, stage + "\\" + os.path.basename(local))
                run_ps(pool, "$global:BinDir = %s" % ps_quote(stage))
            if out_dir:
                run_ps(pool, "$global:OutDir = %s" % ps_quote(out_dir))
            stdout, errs, failed = run_ps(pool, script, width, merge_info=not csv)
            sys.stdout.write(stdout)
            if errs:
                sys.stderr.write(errs + "\n")
            if failed:
                raise Failed(None)
        finally:
            if stage and stage.lower().find("\\kb-") >= 0:
                try:
                    run_ps(pool, "Remove-Item -LiteralPath %s -Recurse -Force -ErrorAction SilentlyContinue" % ps_quote(stage))
                except Exception:
                    pass


def mode_remote_file(client, file_name):
    arg = json.loads(E.get("KB_ARG") or "{}")
    out, err, failed = one_shot(client, with_arg(file_name, arg), 8192)
    if failed:
        raise Failed(err or "the step failed on the host")
    sys.stdout.write(out)


def mode_stage_clean(client):
    arg = json.loads(E.get("KB_ARG") or "{}")
    name = str(arg.get("name", ""))
    if not re.fullmatch(r"kb-[0-9a-f]{16}", name):
        raise Failed("invalid folder name")
    one_shot(client, "Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) %s) -Recurse -Force -ErrorAction SilentlyContinue" % ps_quote(name))


def explain(e):
    """A short, useful message for the usual ways a connection goes wrong."""
    host = E.get("KB_HOST", "the host")
    if isinstance(e, AuthenticationError) or "401" in str(e) or "credentials" in str(e).lower():
        return "the credentials were rejected by %s (check the username, password and that it is an administrator)" % host
    name = type(e).__name__
    msg = str(e)
    if "timed out" in msg.lower() or "Timeout" in name:
        return "%s did not answer in time (is WinRM enabled and port %s open?)" % (host, E.get("KB_PORT") or "5985")
    if "Connection refused" in msg or "ConnectionError" in name or "Max retries" in msg:
        return "could not connect to %s on port %s (is WinRM enabled and reachable?)" % (host, E.get("KB_PORT") or "5985")
    return msg.strip().splitlines()[0][:300] if msg.strip() else name


def main():
    mode = E.get("KB_MODE", "")
    if mode == "shell":
        sys.path.insert(0, HERE)  # the bundled Python does not put the script's folder on the path
        import winrm_shell
        return winrm_shell.run_shell(connect())
    try:
        client = connect()
        if mode == "probe":
            mode_probe(client)
        elif mode == "script":
            mode_script(client)
        elif mode in ("smb-open", "smb-list", "smb-close"):
            mode_remote_file(client, mode + ".ps1")
        elif mode == "stage-clean":
            mode_stage_clean(client)
        else:
            raise Failed("unknown mode " + mode)
        return 0
    except Failed as e:
        if e.args and e.args[0]:
            sys.stderr.write(str(e.args[0]).strip() + "\n")
        return 1
    except Exception as e:  # connection and protocol problems
        sys.stderr.write(explain(e) + "\n")
        if E.get("KB_DEBUG"):
            traceback.print_exc()
        return 2


if __name__ == "__main__":
    sys.exit(main())
