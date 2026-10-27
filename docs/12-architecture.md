<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Security](11-security.md) · Next: [Troubleshooting](13-troubleshooting.md)

# 12. Architecture

How Kookaburrow is built. For contributors, and for administrators who want to know what is on disk.

- [Overview](#overview)
- [Data on disk](#data-on-disk)
- [How a hunt runs, end to end](#how-a-hunt-runs-end-to-end)
- [Remote execution](#remote-execution)
- [The Windows service](#the-windows-service)
- [Permission model](#permission-model)
- [Permission map](#permission-map)
- [Source layout](#source-layout)
- [Extending it](#extending-it)

## Overview

```
Browser ──HTTP(S)──▶ Express server (Node.js)
                       │  auth, permission check, allow-list, Host/Origin checks
                       ├─ JSON store (data/db.json, in memory, atomic writes)
                       ├─ Runners: hunt-runner, response-runner, scheduler, large-transfer
                       ├─ Monitor (ping + port checks), quarantine, scanner
                       ├─ Forwarder (Elasticsearch _bulk)
                       └─ Remote layer
                            ├─ WinRM  ─▶ bundled Python + pypsrp (NTLM, encrypted)  ─▶ Windows targets
                            ├─ SSH    ─▶ ssh2                                      ─▶ Linux targets
                            └─ SMB / SFTP file pulls (large transfers)
```

- **Server**: Node.js 20+ with Express. The MSI bundles Node.js in `runtime\node.exe`.
- **Front end**: plain HTML, CSS and JavaScript in `public/` (no build step), served by the same server. Self-hosted fonts (Inter, JetBrains Mono) and xterm.js for shells.
- **Store**: one JSON file loaded into memory and saved atomically (debounced 100 ms). Simple and fast at this scale; not for huge inventories.
- **Library**: scripts in `collections/` (197) and `actions/` (122), read as text, never executed on the server.

## Data on disk

`KB_HOME` is the data root: `C:\ProgramData\Kookaburrow` for the MSI, the program folder from source.

| Path | Contents |
|---|---|
| `data/db.json` | The database: hosts, groups (lists), credential profiles (passwords encrypted), assignments, runs and their results, users, roles, sessions (hashed tokens), settings, schedules, quarantine records and log, IOC lists, baselines, workflows, pins and favourites (per user) |
| `data/secret.key` | The AES-256-GCM key for stored secrets |
| `data/tls/` | The CA and server certificate and keys |
| `data/monitor-log.jsonl` (+ `.1`) | Health checks, trimmed at 20 MB |
| `data/baselines/` | Uploaded baseline files |
| `data/server.log`, `server.err` | Server output (under the service, `server.log`) |
| `output/` | Hunt and response results, reports, pulled files, see [output layout](04-hunts.md#output-layout) |
| `binaries/` | Uploaded tools |

Program files (`server.js`, `src/`, `public/`, `collections/`, `actions/`, `scripts/`, `runtime/`, `vendor/winrm-runtime/`, `node_modules/`) stay in the program folder.

Runs that were `running` when the server stopped are marked `interrupted` at the next start.

## How a hunt runs, end to end

1. The browser posts `/api/hunts` with a name, collection ids, hosts or groups, parameters and an optional schedule. The route needs `hunts.run`.
2. `hunt-runner.startHunt` resolves each collection, writes a temporary copy with parameter values for those that take them, creates the run folder, records the run and starts the audit log.
3. Up to *Hosts at once* workers each take a host and run its collections in order. Each collection is executed through the remote layer, honouring a cancel signal.
4. Output becomes a CSV saved per host; the row count and a SHA-256 go to the audit log; the rows are queued to Elastic when forwarding is on.
5. For `$Transfer = 'large'` collections, `large-transfer` opens SMB (or uses SFTP), waits for a free slot, pulls and hashes the files and restores the host.
6. At the end the server writes `All_Hosts.csv` and `.json`, sets the final status, and removes its temporary files.
7. The browser polls `/api/runs` while a hunt is running to draw progress.

Responses follow the same path through `response-runner`. Cancelling aborts a per-run `AbortController` (`cancel.js`), which kills the engine process or SSH exec for the host in progress.

## Remote execution

- **WinRM**: `src/remote/winrm.js` drives the bundled helper `winrm_helper.py` (pypsrp) in modes `probe`, `script`, `smb-open`, `smb-list`, `smb-close`, `stage-clean` and `shell`. NTLM with message encryption over HTTP 5985 (or TLS 5986). Credentials go by environment variable. If the engine is missing it falls back to `winrm-run.ps1` (`Invoke-Command` from `powershell.exe`, which needs TrustedHosts for IP targets). Home shows which engine is active.
- **SSH**: `src/remote/ssh.js` with ssh2 streams the script to `bash` (or `pwsh -Command -`) over stdin so nothing is written to the target; `shell.js` gives a real pty.
- **SMB**: `smb.js` and `ps/smb-*.ps1` use the Windows SMB client; the target's Server service and firewall rule are toggled by the `smb-open` and `smb-close` steps. **SFTP**: `sftp.js` over the same SSH connection.
- **Staging**: dependencies are copied to a `kb-<random>` temporary folder on the target, exposed as `$BinDir`, and removed afterwards (also on cancel).

## The Windows service

`KookaburrowService.exe` (compiled from `installer/KookaburrowService.cs` with the .NET Framework compiler) is a thin wrapper:

- Starts `runtime\node.exe server.js` with `KB_HOME` and `KB_SERVICE=1`, appends its output to `data\server.log`, and restarts it when it exits.
- With `KB_SERVICE` set, a Server Settings restart makes the server exit and the wrapper starts the new copy; from source it respawns itself.
- On stop it ends the process tree. It restarts after 1 s normally, or 10 s if the server died within 10 s of starting.

The installer's custom actions (`installer/KbCustomActions.cs`) validate the wizard input; `scripts/install-setup.js` writes the admin user and server settings at install time.

## Permission model

- `src/permissions.js` defines permissions in groups, with *implies* chains (a higher permission includes the lower ones). Roles hold lists of permission keys; `*` means all.
- `src/route-perms.js` maps every API route to the permissions that allow it. **The first matching rule wins; a route with no rule is denied.** A list means *any of these* is enough. `signed in` routes only need a session.
- Some read-only routes accept several permissions because other features need that data (for example the host list for shells and hunts).
- Handlers add checks the table cannot express (granting only permissions you hold, schedule kind, response cancel confirmation).

## Permission map

Generated from `src/route-perms.js`, in the order the rules are evaluated.

| Method | Route (regular expression) | Needs any of |
|---|---|---|
| any | `/api/auth/(login\|logout\|me)` | signed in |
| GET | `/api/(permissions\|about)` | signed in |
| any | `/api/favourites(/\|$)` | signed in |
| PUT | `/api/users/[^/]+/password` | signed in |
| GET | `/api/hosts/[^/]+/history` | `hosts.view` |
| GET | `/api/(hosts\|lists)` | `hosts.view`, `shell.open`, `hunts.run`, `actions.run` |
| GET | `/api/(profiles\|assignments)` | `hosts.view` |
| any | `/api/(scans\|profiles\|assignments\|lists\|hosts\|auth/test)(/\|$)` | `hosts.manage` |
| GET | `/api/binaries` | `collections.view` |
| any | `/api/binaries(/\|$)` | `collections.manage` |
| GET | `/api/collections/user` | `collections.manage` |
| GET | `/api/collections(/\|$)` | `collections.view`, `hunts.run` |
| any | `/api/collections(/\|$)` | `collections.manage` |
| GET | `/api/actions/user` | `actions.manage` |
| GET | `/api/actions(/\|$)` | `actions.view` |
| any | `/api/actions(/\|$)` | `actions.manage` |
| POST | `/api/responses` | `actions.run` |
| POST | `/api/responses/[^/]+/cancel` | `actions.run` |
| POST | `/api/runs/[^/]+/cancel` | `hunts.run` |
| DELETE | `/api/responses/[^/]+` | `actions.run` |
| GET | `/api/workflows` | `workflows.view` |
| any | `/api/workflows(/\|$)` | `workflows.manage` |
| GET | `/api/schedules` | `hunts.view`, `actions.view` |
| DELETE | `/api/schedules/[^/]+` | `hunts.run`, `actions.run` |
| PUT | `/api/schedules/[^/]+` | `hunts.run`, `actions.run` |
| GET | `/api/responses(/\|$)` | `actions.view` |
| GET | `/api/reports` | `hunts.view` |
| POST | `/api/runs/[^/]+/report` | `hunts.export` |
| GET | `/api/runs/[^/]+/report` | `hunts.export` |
| DELETE | `/api/runs/[^/]+/report` | `hunts.run` |
| POST | `/api/(runs\|hunts)` | `hunts.run` |
| DELETE | `/api/runs/[^/]+` | `hunts.run` |
| GET | `/api/runs/[^/]+/(log\.csv\|download)` | `hunts.export` |
| GET | `/api/runs(/\|$)` | `hunts.view` |
| GET | `/api/browse/download` | `hunts.export` |
| DELETE | `/api/browse` | `hunts.run`, `actions.run` |
| any | `/api/(pins\|diff\|compare)(/\|$)` | `hunts.view` |
| GET | `/api/baselines` | `hunts.view` |
| any | `/api/baselines(/\|$)` | `hunts.run` |
| GET | `/api/iocs(/\|$)` | `hunts.view` |
| any | `/api/iocs(/\|$)` | `hunts.run` |
| GET | `/api/browse(/\|$)` | `hunts.view` |
| any | `/api/shell/[^/]+/(ls\|pull\|send)` | `shell.files` |
| any | `/api/shell(/\|$)` | `shell.open` |
| GET | `/api/quarantine(/log)?` | `system.view` |
| any | `/api/quarantine/[^/]+` | `actions.run` |
| any | `/api/monitor(/\|$)` | `system.view` |
| GET | `/api/settings/(health\|shell\|runs\|server\|elastic\|certificate(/ca\.pem)?)` | `system.view` |
| any | `/api/settings(/\|$)` | `system.manage` |
| GET | `/api/(users\|roles)` | `users.view` |
| POST | `/api/users` | `users.manage` |
| DELETE | `/api/users/[^/]+` | `users.manage` |
| PUT | `/api/users/[^/]+` | `roles.manage` |
| any | `/api/roles(/\|$)` | `roles.manage` |

## Source layout

| Path | Purpose |
|---|---|
| `server.js` | Express app, routes, start-up, listening (including HTTPS multiplexing and restart) |
| `src/config.js` | Paths, defaults and limits |
| `src/store.js` | The JSON database |
| `src/auth.js`, `crypto.js` | Users, sessions, password hashing; secret encryption |
| `src/permissions.js`, `route-perms.js` | Permission definitions and the route map |
| `src/collections.js`, `collection-files.js`, `binaries.js`, `binary-sources.js` | The library, metadata parsing, uploads and imports |
| `src/hunt-runner.js`, `response-runner.js`, `scheduler.js`, `cancel.js`, `run-settings.js` | Running, scheduling, cancelling and concurrency |
| `src/large-transfer.js`, `remote/*` | Remote execution and file pulls |
| `src/output.js`, `audit.js`, `zip.js`, `migrate-output.js` | Output folders, the activity log, zip download |
| `src/report.js`, `diff.js`, `compare.js`, `iocs.js`, `browse.js` | Analysis |
| `src/scanner.js`, `monitor.js`, `quarantine.js`, `shell.js` | Discovery, health, containment, shells |
| `src/server-settings.js`, `tls.js`, `tls_gen.py` | Listening, allow-list, HTTPS |
| `src/elastic.js`, `workflows.js` | Elastic forwarding; workflow skeleton |
| `public/` | The interface: `index.html`, `app.js` and per-area scripts, `tokens.css`, `app.css`, `polish.css` |
| `scripts/` | `setup-winrm.js`, `verify-collections.js`, `build-msi.js`, `install-setup.js` |
| `installer/` | WiX source, service wrapper, installer actions, images |

## Extending it

- **A collection or action**: drop a script in the right folder, see [The library](09-library.md#writing-your-own).
- **A new API route**: add the handler in `server.js` **and** a rule in `src/route-perms.js`, or it will be refused.
- **A new permission**: add it to `src/permissions.js`, then to the roles that should have it.
- **A new page**: add it to `NAV` and `PAGE_PERM` in `public/app.js`, a `<section class="page" id="tab/page">` in `index.html`, and a loader.
- After changing a shipped script run `node scripts/verify-collections.js`.
