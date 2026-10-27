# Kookaburrow

Threat hunting platform: scan a subnet, verify and save hosts over WinRM/SSH, run PowerShell collections against one host or a list, and keep the output.

## Install (Windows, offline)

Download `Kookaburrow-<version>-x64.msi` from Releases and run it as an administrator. It bundles Node.js, the app and the WinRM engine, so no internet is needed. Windows 10 / Server 2016 or later, 64-bit.

- **Quickstart**: this PC only, http://127.0.0.1:46200; you only create the admin account.
- **Custom**: listening address, port (default 46200) and allowed computers, then the admin account. Inputs are checked and the firewall port is opened.
- Runs as the auto-start service **Kookaburrow** (LocalSystem). Programs: `C:Program FilesKookaburrow`. Data (database, keys, results, tools): `C:ProgramDataKookaburrow`, kept on upgrade and uninstall.
- Reinstalling over existing data keeps its users and settings. Log: `dataserver.log`.
- Change the address or port later in Settings > System > Server Settings (add a firewall rule yourself for a new port).

Silent install:

```powershell
msiexec /i Kookaburrow-1.0.0-x64.msi /qn ADMINLOGIN=admin ADMINPASS=...
msiexec /i Kookaburrow-1.0.0-x64.msi /qn SETUPMODE=custom LISTENIP=0.0.0.0 PORT=46200 ALLOWFROM=10.0.0.0/24 ADMINLOGIN=admin ADMINPASS=...
```

Build it with `node scripts/build-msi.js` (downloads WiX once; output in `build/`). Pushing a tag like `v1.0.0` builds and attaches it to a release via GitHub Actions.

## Run from source

Requires Node.js 20+ on Windows.

```powershell
npm install
npm start        # http://127.0.0.1:46200
```

Env vars: `KB_HOST` (default 127.0.0.1), `KB_PORT` (default 46200), `KB_HOME` (where data is kept). Saved Server Settings and Certificate (HTTPS) settings override the host and port; localhost is always allowed.

## Elastic

Settings > System > Elastic forwards hunt rows to Elasticsearch (7/8, and SOF-ELK via its port 9200).

- One document per CSV row, sent with the bulk API as results arrive. Index: `<prefix>-<collection>` (data view `<prefix>-*`).
- Fields: `@timestamp`, `host.name`, `host.ip`, `event.dataset`, `kookaburrow.{run_id, hunt, run_by, collection}` (`run_by` = who started the hunt, so users can filter to their own) and the CSV columns under `kookaburrow.data.*` (as text).
- Sign-in: none, API key or user and password (stored encrypted). Needs `create_index`, `index` and `auto_configure` on `<prefix>-*`. **Test connection** checks reachability, sign-in and privileges.
- "Send a past hunt" resends a finished hunt; ids are fixed, so resending replaces rather than duplicates. Failed batches are retried; counts show per hunt and on the page.
- Off by default. Hunts only for now.

## Flow

1. **Scan**: enter a CIDR (up to /20). TCP-probes 22, 135, 445, 3389, 5985, 5986, then does a reverse DNS lookup and an OS guess from the open ports.
2. **Connect**: pick a found host, enter credentials, test the connection. Saving reruns the connection and stores the host only if it succeeds. Hostname and OS come from the target itself.
3. **Hosts**: saved hosts can be grouped into lists.
4. **Collections**: PowerShell collections live in `collections/powershell/*.ps1` and Linux collections in `collections/bash/*.sh`; each shows up in Settings → View Collections automatically, where you can search names and script text and filter by tag. Run one against a host or list. Output is stored in `data/db.json`.

## The library

About 200 hunts (`collections/`) and 115 actions (`actions/`) ship with the app, written in PowerShell for Windows and bash for Linux and signed (see below). They are re-implementations of the techniques in Velociraptor, KAPE and UAC artifacts, not copies of them.

- **Naming**: every name is `Area - Thing`, short and title case, for example `Prefetch - List`, `Prefetch - Parse`, `Prefetch - Collect`, `Event Logs - Logons`, `Host - Isolate`. The file name is the same in kebab case. The variants of one artefact share the area: *List* shows it, *Parse* decodes it, *Collect* brings the raw files back.
- **Parameters**: a hunt or action lists the inputs it takes in `$Parameters = @('LogName', 'LastMinutes?')` (`PARAMETERS=(DAYS? PATTERN)` in bash); a trailing `?` makes one optional. They are set on the Parameters tab of New Hunt / New Response. Event log hunts take `LastMinutes`, or `StartTime` and `EndTime` (`yyyy-MM-dd HH:mm`), and default to the last 24 hours. The values are set as variables on the first lines of the script, so a parameter must not be called `Name`, `Description`, `Type` and so on (PowerShell) or `NAME`, `PATH`, `SECONDS`, `HOSTNAME`, `UID` (bash), which the script itself uses.
- **Raw files** (`$Transfer = 'large'`): hunts that bring files back (Prefetch, hives, event logs, SRUM, jump lists, browser data, memory, captures) write them to `$OutDir` and the server pulls them over SMB (Windows) or SFTP (Linux). See *Large file transfers*.
- **Nothing to install on targets**: parsing of Prefetch, Shimcache, Amcache, UserAssist, BAM, the Recycle Bin and the USN journal is done natively in PowerShell, so no .NET tools are needed on hosts. Collections that do need a tool declare it as a dependency, and it must be one standalone file: Sysinternals `sigcheck64.exe`, `handle64.exe`, `listdlls64.exe`, `accesschk64.exe`, `procdump64.exe`, `autorunsc.exe`; `winpmem.exe`; `yara64.exe` (with your own rules as `kb-rules.yar`); NirSoft `BrowsingHistoryView.exe`; plus `kape.zip` and `uac.tar.gz` for the KAPE and UAC hunts. They all show as "not uploaded" under Settings → Binaries until you add them, and a hunt that needs one stays greyed out in the New Hunt dialog.
- **Upload from server** (Settings → Upload Binaries): instead of uploading from your own computer, point the server at a folder, an SMB share, Nextcloud / WebDAV (a folder address, a WebDAV address or a public share link) or an SFTP server. It searches below that location for the binaries on the list (exact file name, any case; the newest copy is offered first), and you import the ones you want, optionally checking each against an expected SHA-256. A binary that is already uploaded is only replaced if you tick Overwrite. Nothing about the location is saved, and the server will not connect to its own machine or link-local addresses. SMB on a Linux server needs `smbclient` and has not been tested yet.
- **Active Directory hunts** (`AD - ...`) use built-in ADSI and must be run against a domain controller (from a member server over WinRM the double-hop limit stops the query, and the hunt says so).
- **Signed**: `collections/verified.json` and `actions/verified.json` hold the SHA-256 of each shipped script; a script that still matches is "standard", an edited or added one is "custom". After changing a script run `node scripts/verify-collections.js` once you have reviewed it.
- **Actions that can cut you off** (`Host - Isolate`, `Network - Disable Adapter`, `SSH - Disable Password Login`) refuse to run without the information that keeps you connected (an allow list that must include the Kookaburrow server, or an explicit `CONFIRM`), and Host - Isolate can schedule an automatic release.

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

- **WinRM**: runs on a bundled engine, [winrm_helper.py](src/remote/winrm_helper.py), built on [pypsrp](https://github.com/jborean93/pypsrp) (the library KingfishIR uses). It speaks the WinRM protocol itself with NTLM and message encryption over HTTP 5985, so nothing needs configuring on this server or the targets (no TrustedHosts, no AllowUnencrypted). `npm install` (or `npm run setup-winrm`) builds the engine in `vendor/winrm-runtime`: on Windows a private embeddable Python is downloaded (nothing is installed system-wide); on Linux/macOS a virtual environment is made with the Python 3 already installed (`python3-venv` on Debian/Ubuntu). The Shell page uses the same engine. If the engine is not installed, Kookaburrow falls back to [winrm-run.ps1](src/remote/winrm-run.ps1), which runs `Invoke-Command` from `powershell.exe` on this server and needs the target in `TrustedHosts` for IP addresses. Credentials are passed by environment variable, not the command line. Home shows which engine is in use.
- **SSH**: [ssh.js](src/remote/ssh.js) streams the script to `pwsh -Command -` (or `powershell` on Windows) over stdin, so nothing is written to the target.

## Large file transfers (SMB and SFTP)

A collection with `$Transfer = 'large'` (`TRANSFER='large'` in bash) writes files to `$OutDir` (`$OUT_DIR` in bash) on the host, and the server pulls them back into `<host folder>/raw/<collection>/` and removes them from the host. Each file's SHA-256 is compared with the host's, and every step is in the hunt's log. See [large-transfer.js](src/large-transfer.js) and [event-logs-export.ps1](collections/powershell/event-logs-export.ps1).

- **Windows hosts: SMB.** SMB is not normally reachable on targets, so it is opened for the hunt and closed again. The Server service and the "File and Printer Sharing (SMB-In)" firewall rule are turned on only if they were off (limited to the address the host sees this server connect from). The server waits for port 445, connects to `\\host\C$` with the host's saved credentials and pulls the files. Then the service and rule are put back exactly as they were, and the server checks that port 445 no longer answers. If SMB was already on, it is left as found. The New Hunt dialog warns that this will happen.
- **Linux hosts: SFTP** over the existing SSH connection. Nothing is opened.
- **Packaging requirements (the installer must handle these):**
  - **Windows server:** the SMB *client* is used (built into Windows). Make sure the SMB client is not disabled and that outbound port 445 to the targets is allowed. Without it, large pulls from Windows hosts fail.
  - **Linux server:** the installer must provide `smbclient` (package `smbclient` / `samba-client`). The Linux SMB path is written but has **not been tested yet**.
  - **Targets:** the account Kookaburrow uses must be able to reach the admin share (`C$`): a domain or local administrator. For a local account over the network this also needs `LocalAccountTokenFilterPolicy=1`, the same as for WinRM.
- Only hunts use this so far; responses do not.

## Security notes (v0)

- Binds to localhost only and checks Host/Origin headers. There is **no login yet**, so anyone on this machine can use it.
- Credentials are AES-256-GCM encrypted in `data/db.json`, with the key in `data/secret.key`. Move the key to DPAPI before real use.
- SSH host keys are not pinned yet.
- Only run collections you've reviewed. They execute with the saved credentials' privileges.

## Roadmap

User login, SSH key auth, DPAPI key storage, SQLite, structured (JSON) collection output with search across runs, scheduled collections, run diffing.

## Actions

`actions/` mirrors `collections/` (`actions/powershell`, `actions/bash`, plus `TEMPLATE.ps1` / `TEMPLATE.sh`), but its scripts **change** the host: kill a process, create or disable a user, block an address. They use the same metadata variables as collections plus `$Parameters` / `PARAMETERS`, the names of the inputs an action needs. Settings > Actions > View Actions lists them; running them is not wired up yet. After reviewing a shipped script, `node scripts/verify-collections.js` refreshes the verified ticks for both folders.
