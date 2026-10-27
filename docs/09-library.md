<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Settings](08-settings.md) · Next: [Elastic](10-elastic.md)

# 9. The library

About 200 **collections** (hunts) in `collections/` and about 120 **actions** in `actions/`, in PowerShell for Windows and bash for Linux. They are re-implementations of the techniques in Velociraptor, KAPE and UAC artefacts, not copies of them.

- [Naming](#naming)
- [What is in the library](#what-is-in-the-library)
- [Metadata](#metadata)
- [Parameters](#parameters)
- [Dependencies](#dependencies)
- [Output](#output)
- [Raw artefacts and large transfers](#raw-artefacts-and-large-transfers)
- [Verified and custom](#verified-and-custom)
- [Writing your own](#writing-your-own)
- [Conventions and pitfalls](#conventions-and-pitfalls)

## Naming

Every name is `Area - Thing`: short, title case, for example `Prefetch - List`, `Event Logs - Logons`, `Host - Isolate`. The file name is the same in kebab case (`prefetch-list.ps1`). The variants of one artefact share the area: **List** shows it, **Parse** decodes it, **Collect** brings the raw files back.

## What is in the library

The areas of the collections (Linux versions are bash; the rest PowerShell):

| Area | Covers |
|---|---|
| System, Software, Services, Processes, Memory | Host identity, installed software, services (weak permissions, failure commands, unusual), process lists and hashes, handles and loaded DLLs, process and full memory dumps |
| Persistence, Autoruns, Tasks, WMI, BITS, Cron, Systemd | Run keys, IFEO, COM hijacks, Active Setup, Office and PowerShell profiles, accessibility binaries, scheduled tasks (including hidden ones), WMI subscriptions, autoruns; Linux boot and init, cron, systemd units and overrides |
| Execution | Amcache, Shimcache, BAM, UserAssist, Jump Lists, recent files, trusted documents, Prefetch (list, parse, collect) |
| Event Logs | Export, query, summary and focused views: logons, account changes, process creation, PowerShell, Defender, Kerberos, services, tasks, USB, WMI, firewall, AppLocker, RDP, share access, tampering |
| Files | Directory listing, hash, search, recently changed, archives and staging, double extensions, mark of the web, alternate streams, recycle bin, shadow copies, USN journal, writable program folders; Linux capabilities and package integrity |
| Network | Connections, listening ports, interfaces, ARP, proxy, Wi-Fi profiles, firewall rules, packet capture; Linux socket owners and raw sockets |
| Accounts, RDP, AD, SSH, Logins | Local users, groups, sessions and admins; RDP sessions and logons; Active Directory domain info, privileged groups, password risks, SPN accounts, recent changes (run against a domain controller); SSH keys, sessions and command hooks; Linux logins and sudoers |
| Registry, Browser, USB, SRUM, Windows Timeline | Hives, keys, user activity, browser history and extensions, USB history, SRUM and timeline collection |
| Security, Defender, Sysmon | Credential protection, network hardening, installed security products, Defender status and logs, Sysmon events |
| Logs, Config, Users, Shell, Web, Packages, Kernel, Containers | Linux log search and collection, `/etc`, per-user dotfiles and histories, web server configuration, packages, kernel modules and eBPF, Docker and Podman |
| Triage, Baseline, KAPE, UAC, Yara | Quick triage for Windows and Linux, the full Windows baseline, KAPE and UAC runs, YARA scans of files and processes |

Actions are listed in [Responses](05-responses.md#what-the-actions-cover). The live, searchable list is **Settings > Collections > View Collections** and **Actions > View Actions**.

## Metadata

Every collection starts with metadata variables that the platform **reads as text without running the script**. They must be the first statements (comments and blank lines may sit between them) and plain literals: expressions and other variables are not evaluated.

| PowerShell | Bash | Required | Meaning |
|---|---|---|---|
| `$Name = '...'` | `NAME='...'` | yes | `Area - Thing` |
| `$Description = '...'` | `DESCRIPTION='...'` | yes | What it finds, short. Warnings and requirements (admin, root) belong here |
| `$Dependencies = @('x.exe')` | `DEPENDENCIES=(x)` | yes | External binaries not in a standard install; `@()` when none |
| `$Tags = @('persistence')` | `TAGS=(persistence cron)` | yes | Lowercase labels used for filtering |
| `$Parameters = @('A', 'B?')` | `PARAMETERS=(A B?)` | actions, collections that take input | Input names; a trailing `?` is optional |
| `$Footprint` | `FOOTPRINT` | no | `none`, `transient` (stages a tool or temp files and removes them) or `persistent` (changes the host; belongs in Respond) |
| `$Returns` | `RETURNS` | no | `records` (rows), `files` (raw artefacts) or `both` |
| `$Type` | `TYPE` | no | `command`, `artefact` (collects existing files) or `tool` (deploys a dependency and returns its output) |
| `$Transfer = 'large'` | `TRANSFER='large'` | no | The script leaves files in `$OutDir` / `$OUT_DIR` for the server to pull back |
| `$Produces = @('evtx')` | `PRODUCES=(evtx)` | no | The kind of raw files it leaves in `raw/`. A [workflow processor](07-workflows-and-recurring.md#processors) that accepts that kind can run on them. Kinds in use: `evtx` (Event Logs - Export, Triage - Windows Core, KAPE), `prefetch` (Prefetch - Collect, Triage, KAPE), `registry` (Registry - Collect Hives, Triage, KAPE), `jumplists`, `lnk`, `recyclebin` (Recycle Bin - Collect), `srum`, `timeline` (Windows Timeline - Collect), `pcap` (Network - Packet Capture, Windows and Linux), and for KAPE also `mft` |

When left out, `Footprint`, `Returns` and `Type` are worked out: a script with dependencies is a *tool* with a *transient* footprint; one that returns only files is an *artefact* pull; an action is *persistent*. Use single quotes and write a literal apostrophe as two (`''`) in PowerShell.

## Parameters

Inputs are set on the hunt's or response's Parameters step. The values are written as variables on the first lines of a temporary copy of the script, so a parameter must not be named like something the script itself uses:

- PowerShell: not `Name`, `Description`, `Type` and similar metadata names.
- bash: not `NAME`, `PATH`, `SECONDS`, `HOSTNAME`, `UID`.

Event log collections take `LastMinutes`, or `StartTime` and `EndTime` (`yyyy-MM-dd HH:mm`), and default to the last 24 hours. In bash the parameters arrive as `VAR='value'` lines.

## Dependencies

A dependency is an external binary a script needs that is **not** part of a standard Windows or Linux install. It must be **one standalone file** (an `.exe`, a `.deb`, a `.zip`...).

- You upload it once under [Settings > External > Binaries](08-settings.md#binaries); it is matched by **file name**.
- On every run the platform copies it to a temporary folder on the target and sets `$BinDir` (`BIN_DIR` in bash) to that folder before the script starts, then deletes the folder.
- A collection whose binaries are not uploaded is greyed out in the New Hunt dialog.
- Standard cmdlets and modules do not count as dependencies.

The standard dependencies: Sysinternals `sigcheck64.exe`, `handle64.exe`, `listdlls64.exe`, `accesschk64.exe`, `procdump64.exe`, `autorunsc.exe`; `winpmem.exe` (the winpmem mini x64 build renamed); `yara64.exe` with your own rules as `kb-rules.yar`; NirSoft `BrowsingHistoryView.exe`; `kape.zip` (your KAPE folder zipped) and `uac.tar.gz` (the UAC release tarball); and the deploy installers.

Parsing of Prefetch, Shimcache, Amcache, UserAssist, BAM, the Recycle Bin and the USN journal is done natively in PowerShell, so no tools are needed on hosts for those.

## Output

| Script | Result |
|---|---|
| PowerShell over WinRM | The script writes **objects or CSV** to the output; the wrapper turns them into a CSV. One row per object, one column per property |
| PowerShell over SSH, bash | Each output line becomes a row in a single `Output` column. For tabular data print CSV-like lines or use section headings (`== Section ==`) |

Per host one CSV is saved per collection; the hunt also gets `All_Hosts.csv` and `.json` with a `TargetIP` column. See [output layout](04-hunts.md#output-layout). Collections should be read-only and leave nothing behind; stage temporary files under a temp folder and remove them.

## Raw artefacts and large transfers

A collection with `$Transfer = 'large'` writes files to `$OutDir` and the server pulls them back over SMB (Windows) or SFTP (Linux), hashing each one. See [Large file transfers](04-hunts.md#large-file-transfers) and `collections/powershell/event-logs-export.ps1` for a working example.

## Verified and custom

`collections/verified.json` and `actions/verified.json` hold the SHA-256 of every shipped script (line endings ignored). In the library a script that still matches is **verified** (a tick); an edited or added one is **custom**. After you have reviewed a change to a shipped script, refresh the manifests:

```powershell
node scripts/verify-collections.js
```

## Writing your own

**In the UI:** *Settings > Collections > Add Collections* (or *Add Actions*). Choose PowerShell or Linux, a file name, a name, description, tags, footprint, what it returns, type and dependencies, then paste or upload the script.

**From files:** copy a template and save it in the right folder:

| Template | Copy to |
|---|---|
| `collections/TEMPLATE.ps1` | `collections/powershell/<name>.ps1` |
| `collections/TEMPLATE.sh` | `collections/bash/<name>.sh` |
| `actions/TEMPLATE.ps1` | `actions/powershell/<name>.ps1` |
| `actions/TEMPLATE.sh` | `actions/bash/<name>.sh` |

A minimal PowerShell collection:

```powershell
$Name = 'System - Hotfix Count'
$Description = 'Number of installed hotfixes.'
$Dependencies = @()
$Tags = @('inventory')

[pscustomobject]@{ Hotfixes = (Get-HotFix | Measure-Object).Count }
```

A minimal bash collection:

```bash
NAME='System - Uptime'
DESCRIPTION='How long the host has been up.'
DEPENDENCIES=()
TAGS=(inventory)

uptime -p
```

A custom script appears in the library straight away, marked *custom*. Review it before running it on production hosts: collections execute with the saved credentials' privileges.

## Conventions and pitfalls

- **Read-only collections.** A collection that changes the host belongs in Actions.
- **Nothing extra on targets.** Use what a standard install has; anything else is a declared dependency.
- **bash scripts are piped to bash over SSH:** do not read from stdin. Keep LF line endings.
- **Passwordless sudo.** Linux scripts that need to read protected files use `sudo -n` when not root, and say so in the description.
- **AMSI.** Do not put well-known attacker tool names in a PowerShell collection, even inside a detection pattern: Windows AMSI can block the whole script as malicious.
- **Timeouts and size.** A collection has up to 10 minutes per host and its captured output is capped at 5 MB. Use a large-transfer collection for big data.
- **Naming.** Keep to `Area - Thing`, and keep the variants of an artefact in one area.
