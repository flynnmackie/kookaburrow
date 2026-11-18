<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Settings](08-settings.md) · Next: [Elastic](10-elastic.md)

# 9. The library

About 400 **collections** (hunts) in `collections/` and about 120 **actions** in `actions/`, in PowerShell for Windows and bash for Linux. They are re-implementations of the techniques in Velociraptor, KAPE and UAC artefacts, not copies of them.

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
| Triage, Baseline, KAPE, UAC, Yara | Quick triage for Windows and Linux, **Triage - Linux Full** (a UAC-style live response with no tool to upload, see below), the full Windows baseline, KAPE and UAC runs, YARA scans of files and processes |

Actions are listed in [Responses](05-responses.md#what-the-actions-cover). The live, searchable list is **Settings > Collections > View Collections** and **Actions > View Actions**.

### The second 200

The library doubled with about 100 PowerShell and 100 bash collections, written with Velociraptor's artifacts, UAC and the community hunts as the model, none of them copied. All are read-only, run with no uploaded tool, and finish in seconds (the file hunts in a minute or two). The bash ones print **tab-separated rows with a header line**, so they are columns in Diff, Cross-host comparison and Continuous like the PowerShell ones.

| Area | Examples |
|---|---|
| System and hardware | Windows features, pending reboot, firmware and Secure Boot, uptime, time sources, page file and crash dumps, WSL and Hyper-V, Windows Update and WSUS; Linux CPU and memory, reboot history, NTP, installed kernels and boot loader, limits and core dumps, virtualisation, cloud instance, SELinux and AppArmor, mount options, memory file systems |
| Accounts | Password and lockout policy, stale local accounts, user profiles, stored credentials, remote access groups, dangerous user rights; Linux login policy and PAM, who is logged in, last login per account, home directory permissions, group memberships, system accounts with shells, password hash algorithms |
| Network | Routes, DNS client, port proxies, mapped drives, firewall profiles, RDP and WinRM configuration, OpenSSH on Windows, VPN connections; Linux routes, DNS, neighbours, NFS and Samba shares, wireless and bridges, proxies, DHCP leases, established connections with programs, UDP sockets, services on all interfaces, remote addresses by count, namespaces and tunnels |
| Persistence | Winlogon, AppInit and AppCert DLLs, netsh helpers, print monitors, time providers, screensaver and boot execute, logon and GPO scripts, file association handlers, KnownDLLs; Linux at and anacron, udev rules, systemd timers and user units, desktop autostart, login scripts, ld.so.preload, network hooks, package manager hooks, Python startup hooks |
| Execution and forensics | Run dialog history, Program Compatibility Assistant, open and save dialog history, mounted devices, known networks, error reports and crash dumps, Office recent files, cloud sync clients, per-user software, PowerShell logging configuration, outbound RDP history, PuTTY sessions |
| Event logs | Failed logons, explicit credential use, special privileges, lockouts, NTLM validation, startup and time changes, driver installs, code integrity, WinRM, BITS, application crashes, print jobs, DNS client lookups |
| Processes and services | Process tree, suspicious parent and child pairs, unusual locations, owners, service host groups; services in detail, unquoted paths, SYSTEM services outside system folders, security services; Linux unusual paths, listening programs, capabilities, namespaces, deleted libraries, kernel thread impostors, top resource users |
| Files | User-area programs, scripts in odd places, new programs, hidden files, large files, password stores, known attack tool names, changed system binaries; Linux hidden files, immutable flags, new programs, unowned programs, suspicious links, core dumps, web-root archives, files in /dev, writable scheduled files, SUID outside standard folders, readable private keys |
| Logs (Linux) | SSH logins, sudo and su failures, cron runs, package operations, kernel faults, failed services, USB devices, firewall drops, web access summary, root logins, journal health, missing or empty logs |
| Software, cloud, security | Runtimes, admin tools, AppX, package managers, management agents; Linux Snap and Flatpak, Python and Node packages, compilers and tools, repository keys, Docker configuration and risky containers, Kubernetes, cloud credential files and agents, auditd, fail2ban, AV and integrity tools, web server, PHP and Tomcat, databases |
| Active Directory | Domain controllers, trusts, AdminSDHolder accounts, delegation, new computers, group policy objects |

### Triage - Linux Full

A live-response triage in the style of UAC (Unix-like Artifacts Collector) that needs **no tool and no upload**: it is a plain bash collection. It needs root, or an account with passwordless sudo, and changes nothing on the host. Use *Triage - Linux Core* for a quick look and this one for an incident.

| Parameter | Default | |
|---|---|---|
| `DAYS` | 14 | Days of logs, changed files and unit files to collect (1 to 365) |
| `BODYFILE` | yes | A timeline of every file on the root file system (`find / -xdev`, mactime format). The slowest part: say `no` for a quick run |
| `HASH` | yes | SHA-256 of every running program (even one whose file was deleted) and of the program files in the usual places and in temp folders |

What comes back (one folder, pulled over SFTP like other large transfers):

| Folder | Content |
|---|---|
| `live_response/system` | date and time zone, kernel and modules (with taint and signer), `sysctl` security settings, systemd units and timers, init scripts, SELinux/AppArmor, `LD_PRELOAD` and `ld.so.preload` |
| `live_response/process` | `ps` forest and full list, `pstree`, `lsof` (all, network, deleted files), a CSV of every process (executable, whether the file is deleted, working directory, command line), a folder per process with `/proc` status, command line, open files, memory map, cgroup and links, hidden pids (in `/proc` but not in `ps`) |
| `live_response/network` | sockets, listening ports with owners, unix and raw/packet sockets, interfaces, routes, ARP, firewall rules (iptables, nftables, ufw, firewalld), DNS and hosts, tunnels and VPNs, `/proc/net` |
| `live_response/users` | accounts, password status, sudoers, logons (`who`, `last`, `lastb`, `lastlog`), SSH authorized keys, cron and at jobs |
| `live_response/persistence` | startup files, changed systemd units, user startup files, kernel module and udev persistence, login hooks |
| `live_response/suspicious` | SUID/SGID, world-writable files, files with no owner, capabilities, hidden files in system and web folders, executables and ELF files in temp folders, files changed in the last `DAYS` days, web shell candidates |
| `live_response/storage`, `hardware`, `packages`, `containers` | disks and mounts; CPU and memory; installed and recently changed packages and repositories; Docker, Podman, LXC and Kubernetes |
| `files/` | `var-log.tgz` and `journal.export.gz` (last `DAYS` days), `etc.tgz` (without `/etc/shadow` and private keys), `user-files.tgz` (shell histories, startup files, `.ssh` files), `persistence.tgz` |
| `hashes/`, `bodyfile/` | the program hashes and the timeline (`bodyfile.txt.gz`, open in a timeline tool) |
| top level | `collection-info.txt` (host, kernel, times, account, parameters), `collection-errors.log` (commands that ran out of time) and `file-hashes.sha256`, the SHA-256 of every file collected, for chain of custody |

- Every command has a five-minute limit, so one hung tool cannot stall the run. A command that is not installed (no `docker`, no `lsof`) just leaves a file saying so.
- The run is read-only apart from files in its own temp folder, which is deleted after the transfer. Process data is read from `/proc`, so it works without `lsof` and on minimal systems. The bodyfile needs GNU `find`; on BusyBox it falls back to `stat`.
- **Tested** on Ubuntu 24.04 (WSL2) as root: with the defaults it took about 5 minutes on a small system; without bodyfile and hashes, about 15 seconds. Refuses to run, with a message, without root or passwordless sudo. Not tested on RHEL, Alpine or a busy production server (the bodyfile and hashes scale with the number of files).

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
| `$Produces = @('evtx')` | `PRODUCES=(evtx)` | no | The kind of raw files it leaves in `raw/`. A [workflow processor](07-workflows-and-recurring.md#processors) that accepts that kind can run on them. Kinds in use: `evtx` (Event Logs - Export, Triage - Windows Core, KAPE), `prefetch` (Prefetch - Collect, Triage, KAPE), `registry` (Registry - Collect Hives, Triage, KAPE), `jumplists`, `lnk`, `recyclebin` (Recycle Bin - Collect), `srum`, `timeline` (Windows Timeline - Collect), `pcap` (Network - Packet Capture, Windows and Linux), `memory` (Memory - Full Dump, Windows with WinPmem and Linux with AVML), and for KAPE also `mft` |
| `$DiffIgnore = @('LastRun')` | `DIFFIGNORE=(LastRun)` | no | Columns that change on every run, so they do not make a row look new in [Diff](06-results.md) or on [recurring hunts](07-workflows-and-recurring.md#what-changed-since-the-previous-run). Process IDs, uptime, free space and similar are ignored already |
| `$DiffKey = @('Name', 'Path')` | `DIFFKEY=(Name Path)` | no | Instead of `DiffIgnore`: only these columns identify a row when two runs are compared |

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

The standard dependencies: `avml` (Microsoft AVML, the static Linux build, for **Memory - Full Dump** on Linux); Sysinternals `sigcheck64.exe`, `handle64.exe`, `listdlls64.exe`, `accesschk64.exe`, `procdump64.exe`, `autorunsc.exe`; `winpmem.exe` (the winpmem mini x64 build renamed); `yara64.exe`, with the rules managed on [Settings > YARA Rules](08-settings.md#yara-rules) (they become `kb-rules.yar`); NirSoft `BrowsingHistoryView.exe`; `kape.zip` (your KAPE folder zipped) and `uac.tar.gz` (the UAC release tarball); and the deploy installers.

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
