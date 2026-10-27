<p align="center">
  <img src="public/logo.png" alt="Kookaburrow" width="220">
</p>

<h1 align="center">Kookaburrow</h1>

<p align="center">A threat hunting and response platform for Windows and Linux estates.<br>
Discover hosts, run hunts (collections) and responses (actions) over WinRM and SSH, keep a verifiable record of everything collected, and forward the results to Elastic.</p>

---

## What it does

- **Find and connect hosts.** Scan subnets, authenticate with saved credential profiles, and keep a host inventory with live health checks.
- **Hunt.** Run about 200 read-only collections (PowerShell for Windows, bash for Linux) against one host, a group or many hosts at once. Per-host progress, cancel, and recurring schedules.
- **Respond.** Run about 120 actions that change hosts: contain, kill, disable, deploy agents. Warnings before running, and a cancel that tells you what it may have left half done.
- **Keep evidence.** Every step is logged with timestamps and SHA-256 hashes. Raw artefacts (event logs, hives, memory) are pulled back over SMB or SFTP and verified.
- **Analyse.** Searchable HTML reports, run-to-run diff, cross-host comparison, IOC matching, a file browser with pins.
- **Forward.** Send every hunt row to Elasticsearch, filterable by who ran the hunt.
- **Operate safely.** Users and roles, HTTPS with a built-in CA, a client IP allow-list, encrypted credentials.
- **Install offline.** One MSI that carries everything it needs.

## Quick install (Windows)

1. Download `Kookaburrow-<version>-x64.msi` from [Releases](https://github.com/flynnmackie/kookaburrow/releases) and run it as an administrator.
2. Choose **Quickstart** (this PC only, port 46200) and create the admin account.
3. Open <http://127.0.0.1:46200> and sign in.

Details, silent installs, upgrades and running from source: [Installation](docs/01-installation.md).

## Documentation

| Guide | What is in it |
|---|---|
| [1. Installation](docs/01-installation.md) | The MSI wizard, silent install, files and the service, upgrade and uninstall, running from source, building the installer |
| [2. Getting started](docs/02-getting-started.md) | Signing in, a tour of the interface, your first host, hunt and report |
| [3. Hosts](docs/03-hosts.md) | Discovery, credential profiles, adding hosts, host requirements, groups, health monitor, quarantine, shell |
| [4. Hunts](docs/04-hunts.md) | The New Hunt wizard, parameters, quick and recurring hunts, progress and cancel, large file transfers, output layout |
| [5. Responses](docs/05-responses.md) | Actions, running and cancelling them safely, actions that can cut you off, deploy actions |
| [6. Results and analysis](docs/06-results.md) | Activity log, JSON, reports, diff, cross-host comparison, IOC lists, baselines, Browse and Pinned |
| [7. Workflows and recurring runs](docs/07-workflows-and-recurring.md) | Scheduling hunts and actions, and the workflow skeleton |
| [8. Settings](docs/08-settings.md) | Users and roles, shell, health, run, server, certificate, binaries |
| [9. The library](docs/09-library.md) | Collections and actions, naming, metadata, parameters, dependencies, signing, writing your own |
| [10. Elastic](docs/10-elastic.md) | Forwarding hunts to Elasticsearch: setup, document format, privileges, Kibana, SOF-ELK |
| [11. Security](docs/11-security.md) | Authentication, sessions, encryption, network exposure, what runs with which privileges, limits |
| [12. Architecture](docs/12-architecture.md) | Components, data on disk, remote execution, permission model and API map, source layout |
| [13. Troubleshooting](docs/13-troubleshooting.md) | Symptoms, causes and fixes |

## At a glance

| | |
|---|---|
| Server | Node.js 20+ (bundled in the MSI), Express, JSON store |
| Remote | WinRM (bundled pypsrp engine, NTLM, encrypted) and SSH |
| Default address | `http://127.0.0.1:46200` |
| Service | `Kookaburrow` (Windows, automatic start) |
| Data | `C:\ProgramData\Kookaburrow` (MSI install) or `data/` and `output/` (from source) |
| Hunts | about 200 (Windows and Linux) |
| Actions | about 120 (Windows and Linux) |

## Status

Version 1.0. The core (hosts, hunts, responses, results, settings, installer) is complete. Elastic forwarding and the Workflow area are new: Elastic forwarding has been tested against a mock server only, and Workflows are a skeleton (they can be saved but nothing runs yet). See [Security](docs/11-security.md#known-limits) for the current limits.
