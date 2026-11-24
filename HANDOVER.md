# Kookaburrow: handover

Written 2026-11-24 for the agent taking over. State: branch `main`, last commit `3f46acd`, working tree clean, **nothing pushed**.

## 1. What it is

Kookaburrow is a Node.js (20+, Express) threat-hunting platform. It runs PowerShell and bash collections ("hunts") and response actions on Windows (WinRM, bundled Python + pypsrp) and Linux (SSH via ssh2) hosts, stores results, and lets you diff, baseline, report and forward them to Elastic. Front end is plain HTML/CSS/JS in `public/` with no build step. Data is one JSON file (`data/db.json`). Version 1.0.0 shipped as a Windows MSI on 2026-10-27.

- Dev server: https://127.0.0.1:46200, login admin / admin. Start with `node server.js`.
- Node is not always on PATH in the tool shell; set `$env:Path` from Machine+User first.
- Architecture, data layout, permission map and source layout are in [docs/12-architecture.md](docs/12-architecture.md). User docs are `docs/01`–`13` and `README.md`. **Read 12 first.**
- Routes are permission-gated in [src/route-perms.js](src/route-perms.js): an unlisted route is denied, so every new route needs a rule there.

## 2. How the user wants to work (important)

- **The user repeatedly corrects over-building.** Do exactly what is asked, nothing more. The last feature was cut down four times ("just the line, NOTHING else"). When unsure, do less and ask.
- Older rule: work step by step, and don't edit, install or commit until told to. Commit only when asked ("commit" / "commit everything").
- Restart the server yourself after backend changes (stop whatever listens on 46200, start `node server.js` hidden, logs to `data/server.log` / `data/server.err`, check `/api/hunts`). Front-end-only changes just need Ctrl+F5.
- Hunts and actions are named **"Area - Thing"** in title case, 40 characters or fewer, unique (e.g. `Prefetch - Parse`, `Host - Isolate`). Area is plural for things. No detail in the name (large-transfer status is a badge). File name is the kebab-case equivalent.
- Binaries must be standalone single files; the user cannot rely on .NET on targets.
- Pronouns: use they/them unless told.
- Tooling quirk on this machine: bash heredocs and `node -e` with backslashes or template literals get mangled. Write patch scripts to a file with the Write tool, run them, delete them.

## 3. What has been done

Commits (newest first): `3f46acd` Diff reports/drift report/permanent lines; `d6caea1` Diff/Cross-host/Baselines overhaul, continuous watches, approvals, Volatility, YARA picker, ranked search, 200 hunts; `9e6dcef` SSO, firewall, setup .exe, offline docs, Kibana, scanner; `f1f4baf` workflows, processors, dependencies, signing, Binaries page; `759f6ca` docs; `a706a55` 1.0.0.

### Core (1.0)
Hosts and discovery scan, WinRM/SSH, hunts and responses, large transfers (SMB for Windows, SFTP for Linux), Burrow scheduling, Elastic forwarding, Windows MSI + setup .exe (self-signed), HTTPS settings, roles and permissions, audit log, quarantine (host isolation), shells, offline docs viewer.

### Built since 1.0
- Workflows and processors (Hayabusa, Chainsaw, Zircolite, Eric Zimmerman tools, Volatility 3, Zeek); Settings > External (Binaries, Dependencies).
- OIDC single sign-on; Windows Firewall rule management; Kibana dashboards + import.
- Recurring diffs, baselines, "expected" changes; YARA rules (12 built-in files, 34 rules, `YaraRule` hunt parameter, `src/yara-rule.js`, `src/yara-scan.js`); Health > Validate; approvals (Settings > Approvals, Burrow > Approvals, `actions.approve`; Quarantine and shells are not gated by design).
- Health tab renamed **Monitor** (Health, Health log, Quarantine log, Validate, Continuous). Continuous watches (`src/watch.js`): light collections every few minutes, events only on change.
- Ranked search for collections/actions; about 400 collections (100 PS + 100 bash added) with bash TSV tables (`output.textToCsv`).
- **Diff / Cross-host / Baseline overhaul**: `src/diff.js`, `src/diff-keys.js` (volatile/time/key inference), modified-item detection, time-only noise hidden, pooled hosts, cross-host drift and host ranking, shared change report `public/changes.js` (used by Diff in `public/browse.js` and Baseline in `public/analysis.js`).

### The latest feature: Diff reports (commit 3f46acd)
When two runs are compared on Results > Diff, the page shows **only one line per comparison** and nothing else (the user's explicit requirement):

`Name A · date → Name B · date   Before ↗  After ↗  Drift report ↗`

- Pressing Compare calls `POST /api/diff/reports` (server.js, block before the "Cross-host comparison" marker). It generates the normal HTML report for each side that is a finished run (`src/report.js`, `writeReport`, skipped if already newer than the run's `finishedAt`), and returns `{a, b, drift}` URLs. A baseline side has no report (shown greyed).
- `GET /api/diff/drift-report?a=&b=[&pool]` returns the **drift report**: one static, self-contained HTML page (`src/drift.js`, `driftReport`), escaped, no script, served with the sandbox CSP. It lists every change **worst first**, colour coded:
  - **Red** = dangerous (attack tools, encoded/hidden/download-run PowerShell, programs in writable paths, reverse shells, Defender exclusions, persistence hooks, privileged groups, attack-tool ports, root/weak SSH).
  - **Amber** = new or changed in a collection with attention >= 1.
  - **Green** = gone, or inventory.
  - Each row names the host, item and why (`classify`, `entries` in `src/drift.js`).
- Permission: `hunts.export` (rule in route-perms.js).
- The lines are **permanent**: `dfRemember` / `dfHistory` in `public/browse.js` keep the last 200 in the browser's `localStorage` (key `kb.diffLines`), newest first, de-duplicated by drift URL, shown on page load too. They are per browser, not server-side.
- `chNew(..., { lineOnly: true, onLinks, draw })` in `public/changes.js` drives this; the Baseline page still shows the full change report.
- Documented in `docs/06-results.md` ("The reports.").

## 4. Known gaps and things not tested

- **Diff-line history is browser-only.** Offered to the user to move server-side; not answered. Ask before building.
- Latest front-end (lineOnly + permanent lines) was syntax-checked but **never loaded in a browser**. First job: hard refresh, press Compare, confirm one line per comparison and that it persists.
- Drift classifier rules are heuristic regexes (`src/drift.js`); they have only been checked against a synthetic six-host fleet (3 red, 4 amber, 1 green). Tune on real data.
- The test harness (a scratch server on port 46290 with a fleet generator, `drifttest.js` / `fleet.js`) lived in a session scratchpad and may be gone. It needs recreating if you want regression tests: write six Windows hosts' CSV output into `output/hunts/H_<name>_<stamp>/...`, plus a `db.json`, start `server.js` with `KB_HOME` and `KB_PORT` set. Older full test suites were already lost.
- Not tested live: Volatility on a real memory image; Triage - Linux Full on RHEL/Alpine; continuous watches (host side mocked only); new 200 hunts on real fleets; AD hunts (no domain); non-Ubuntu Linux; admin-only PS hunts as admin; Eric Zimmerman processors against real artefacts; Zeek and everything on a Linux server; SMB on a Linux server (needs `smbclient`, written but untested).
- A real MSI install / upgrade / uninstall on another host (error 1603 on the user's host was unresolved as of 2026-10-28).

## 5. Future work (bookmarked, nothing is approved; ask before building)

**Fix first**
- MSI install/upgrade/uninstall test on a clean host; visual check of Respond, Diff, Compare and dialogs in the flat UI; skim the shortened hunt/action descriptions.

**Platform**
- Native Node WinRM (NTLMv2 with sealing, over 5985, WS-Man shell running `powershell -Command -`), replacing the bundled pypsrp path behind a transport interface. **Decided but explicitly deferred** until the user has a range of targets; spike against a real target first (optionally trial the npm `winrm-client`). Node 24 drops RC4/MD4, so write them in JS. Carry over access states (Absent / Creds Rejected / Authenticated via a TCP 5985 probe). NTLM only; Kerberos separate.
- WinRM HTTPS/Kerberos and SSH key auth testing; credential vault option.
- Linux server install (.deb/.rpm + systemd) — deferred until more features are in; backup/restore; run retention policy.
- In-app update notice; signing with a public CA certificate (self-signed only so far); installer must guarantee the SMB client (Windows server) / `smbclient` (Linux server) for large transfers.
- Stronger audit, password reset, SSO/AD sign-in refinements; scheduled-hunt diff vs previous run with alerts (email/webhook).

**Content**
- macOS and cloud (M365/AWS) hunts; YARA rule management; one-click fetch of standard tools for online installs (15+ processor zips).
- Takajo (needs a step to read another step's output); standalone `$MFT` collection; portable .NET runtime fallback; Zeek on a Windows server (WSL).

## 6. Useful pointers

- Server entry: `server.js` (large; routes and wiring). Runners: `src/hunt-runner.js`, `src/response-runner.js`, `src/scheduler.js`, `src/workflow-runner.js`, `src/large-transfer.js`. Remote layer: `src/remote/`.
- Collections `collections/`, actions `actions/`, YARA `yara-rules/`, processors `processors/`, Kibana `elastic/`, installer `installer/` and `build/`.
- Front-end pages: `public/app.js` (shell, helpers `api`, `esc`, `$`, `toast`, `can`), `browse.js` (Results, Diff), `analysis.js` (Baseline), `changes.js`, `report.js`, `watch.js`, `validate.js`, `approvals.js`, `recurring.js`, `workflow.js`, `yara.js`.
- Memory notes for the previous agent live in `C:\Users\bruce\.claude\projects\c--Users-bruce-kookaburrow\memory\` (preferences above are copied from there).
