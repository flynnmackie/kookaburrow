# Kookaburrow

Threat hunting platform: scan a subnet, verify and save hosts over WinRM/SSH, run PowerShell collections against one host or a list, and keep the output.

## Run

Requires Node.js 20+ on Windows.

```powershell
npm install
npm start        # http://127.0.0.1:46200
```

Env vars: `KB_HOST` (default 127.0.0.1), `KB_PORT` (default 46200).

## Flow

1. **Scan**: enter a CIDR (up to /20). TCP-probes 22, 135, 445, 3389, 5985, 5986, then does a reverse DNS lookup and an OS guess from the open ports.
2. **Connect**: pick a found host, enter credentials, test the connection. Saving reruns the connection and stores the host only if it succeeds. Hostname and OS come from the target itself.
3. **Hosts**: saved hosts can be grouped into lists.
4. **Collections**: PowerShell collections live in `collections/powershell/*.ps1` and Linux collections in `collections/bash/*.sh`; each shows up in Settings → View Collections automatically, where you can search names and script text and filter by tag. Run one against a host or list. Output is stored in `data/db.json`.

## Writing a collection

Copy [TEMPLATE.ps1](collections/TEMPLATE.ps1) or [TEMPLATE.sh](collections/TEMPLATE.sh). Every collection starts with four plain-literal metadata variables, which the platform reads as text without running the script:

```powershell
$Name = 'Short title'
$Description = 'What it looks for and why.'
$Dependencies = @()                      # external binaries only, e.g. @('autorunsc.exe')
$Tags = @('persistence', 'wmi')          # lowercase labels used for filtering
```

Bash uses `NAME=''`, `DESCRIPTION=''`, `DEPENDENCIES=()` and `TAGS=(persistence cron)`. Collections should be read-only and need nothing beyond a standard Windows or Linux install. Anything else is a dependency: upload it under Settings → Binaries and the platform stages it in a temporary folder on the target for the run (available to the collection as `$BinDir`), then deletes it.

Avoid putting well-known attacker tool names in a PowerShell collection, even inside a detection pattern: Windows AMSI can block the whole script as malicious.

## How remote execution works

- **WinRM**: the server spawns `powershell.exe` running [winrm-run.ps1](src/remote/winrm-run.ps1), which calls `Invoke-Command -FilePath <collection>`. Credentials are passed by environment variable, not the command line. For non-domain targets, add the target to `TrustedHosts` on this machine or use HTTPS.
- **SSH**: [ssh.js](src/remote/ssh.js) streams the script to `pwsh -Command -` (or `powershell` on Windows) over stdin, so nothing is written to the target.

## Security notes (v0)

- Binds to localhost only and checks Host/Origin headers. There is **no login yet**, so anyone on this machine can use it.
- Credentials are AES-256-GCM encrypted in `data/db.json`, with the key in `data/secret.key`. Move the key to DPAPI before real use.
- SSH host keys are not pinned yet.
- Only run collections you've reviewed. They execute with the saved credentials' privileges.

## Roadmap

User login, SSH key auth, DPAPI key storage, SQLite, structured (JSON) collection output with search across runs, scheduled collections, run diffing.

## Actions

`actions/` mirrors `collections/` (`actions/powershell`, `actions/bash`, plus `TEMPLATE.ps1` / `TEMPLATE.sh`), but its scripts **change** the host: kill a process, create or disable a user, block an address. They use the same metadata variables as collections plus `$Parameters` / `PARAMETERS`, the names of the inputs an action needs. Settings > Actions > View Actions lists them; running them is not wired up yet. After reviewing a shipped script, `node scripts/verify-collections.js` refreshes the verified ticks for both folders.
