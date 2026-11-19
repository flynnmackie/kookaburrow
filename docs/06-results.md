<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Responses](05-responses.md) · Next: [Workflows and recurring runs](07-workflows-and-recurring.md)

# 6. Results and analysis

Everything a hunt or response produces is kept as ordinary files plus a record in the database, and can be examined in several ways.

- [Activity log](#activity-log)
- [JSON](#json)
- [Report](#report)
- [Diff](#diff)
- [Cross-host comparison](#cross-host-comparison)
- [IOC lists](#ioc-lists)
- [YARA scan](#yara-scan)
- [Baseline](#baseline)
- [Browse](#browse)
- [Pinned](#pinned)
- [Permissions](#permissions)

## Activity log

**Results > Activity** is a chain-of-custody trail for each hunt or response: every step with a UTC timestamp. Runs are listed as expandable groups (*Expand all* / *Collapse all*).

| Column | Meaning |
|---|---|
| Time | UTC timestamp |
| Kind | hunt, session (host and tool steps), collect, evidence, warn or error; sets the row colour |
| Host | The target, or *All hosts* |
| Action | What happened: hunt started, host started, collect, tool cleanup, output written, hunt complete... |
| Artefact | The collection or file concerned |
| Size | Bytes received |
| Source hash / Received hash / Match | SHA-256 on the host and as received, for transferred files, and whether they match |
| Outcome | ok, ok (empty), error, cancelled, warning |
| Detail | Rows and duration, errors, where the file was saved. Hover the cell for the SHA-256 of what was written |

The same log is written as it happens to `<name>_Log.csv` in the run's output folder, so it survives outside the platform. Credentials and collected output are never put in it. Runs from before the log existed show a plain summary.

## JSON

**Results > JSON** shows the data a hunt collected as JSON, with **Copy** and **Download**. It is the run's own `<name>_All_Hosts.json`: the hunt's details, its hosts, and for each collection its columns and every row from every host as a record (with a `TargetIP` field). Older runs use the layout they were made with.

## Report

**Results > Report > Generate report** builds one self-contained HTML page for a hunt or response, covering every host together:

- A title block, a sticky **search bar**, and a section list down the left.
- One section per collection (or action) with a table of its rows from all hosts, each row naming its host. A **host filter** at the top shows or hides hosts.
- Up to 100 rows of each collection per host are shown; the CSVs in the output folder hold all rows, and the report says when rows were cut.
- For the Windows baseline collection the summary shows a per-artefact breakdown (what was collected and how many rows).
- Everything that came from a host is escaped before it goes into the page.

Reports are saved in `output/reports/` as `<H|R>_<name>_<date>_Report.html`, listed on the page, and can be downloaded (needs `hunts.export`) or deleted (needs `hunts.run`). They need no external files, so they can be mailed or archived.

## Diff

**Results > Diff** shows what is **new, gone and changed** between two runs (or baselines). It is built so that an unchanged host compared with itself shows nothing.

**Choosing what to compare.** *Quick compare* offers the latest run of each hunt against the one before, in one click. Otherwise pick **Before** and **After** (typically the same hunt on two dates, or a [baseline](#baseline)) and press **Compare**. *Compare one file from each side* is for a single CSV. The tiles show how many rows are **new**, **gone** and **changed**, and how many hosts each side had.

**Reading the result.**

- The list is grouped **by collection** (switch to **by host**). Collections that matter most come first: persistence, accounts, command and control, malware, privilege escalation, then execution and lateral movement. Each shows its name from the library and a tag.
- Open a file to see its rows. **Changed** is one item whose fields differ: only the fields that changed are shown, old value struck through, then the new one (*State: Running → Stopped*). **New** and **Gone** are rows on one side only.
- **Search** filters collections, hosts and the rows you have opened; **Open all changes** opens every changed collection so the search covers them; **Export CSV** writes every change (collection, host, new/gone/changed, item, field, before, after) to one file. **wrap long values** keeps long commands readable.
- **Expected** on a row (needs `hunts.run`) marks it as known to come and go: it is not reported again, on any host (see [Expected changes](#expected-changes)). A changed item is accepted by marking its new state.

**The reports.** When two runs are compared, Diff makes the [report](#report) of each (if missing or older than the run) and shows one line, and nothing else, with three links: **Before**, **After** and **Drift report**. A baseline has no report of its own, so its link is greyed out. The **drift report** is one page listing every change worst first, colour coded red, amber and green, with the host, the item, the details and *why* it was rated that way. Needs `hunts.export`.

- **Red (dangerous)**: the change looks like an attack or a weakened protection: encoded, hidden or download-and-run PowerShell, a program that runs from a temp, download, AppData or ProgramData folder, a new member of an administrator group, a well-known attack tool, a reverse shell, antivirus exclusions, an `ld.so.preload`, `authorized_keys` or AppInit hook, root access or weak SSH settings, or a port attack tools favour.
- **Amber (look at)**: a new or changed item in a collection about persistence, accounts, command and control, execution, lateral movement or the network.
- **Green (low risk)**: something that went away, or a change in an inventory collection.
- The rating is a guide to where to look first, not a verdict: every red item still needs a person to decide. The patterns are in `src/drift.js`. Items marked [expected](#expected-changes) and time-only differences are not rated.

**What does not count as a change** (what is compared, so that running an unchanged hunt again shows no changes):

- **Run records** (the log and the run summary) differ on every run and are not compared. The combined `_All_Hosts.csv` repeats every host's rows and never counts.
- **Collected files** (under `raw/`, such as event logs and hives) count only when one appears or disappears; their bytes change on every collection.
- **Times and counters.** A column of dates and times (created, modified, last run, a time stamp; found by its name *and* by what is in it), and the volatile columns (process IDs, CPU and memory counters, uptime, free space, durations, a collection's own `$DiffIgnore`), are **not** what makes an item new or changed. The same service with a new *last started* is the same service. Such items are counted as **noise**, hidden, and listed if you tick *list them*. Where the time **is** what tells rows apart (an event log, a timeline) it is kept: a new event is new.
- **Items are found by a key**: the collection's `$DiffKey`, or else the smallest set of columns that tells the rows apart (a service's *Name*, a process's *Name* and *Path*), worked out from the data, so it also works for collections you write. Same key and different other columns is **changed**; a key on one side only is **new** or **gone**. A collection's `$DiffKey` on its own decides what a row is, as before. Items with the same key and a different command line are told apart only when nothing tidier separates them.
- Values that hold the run's folder name, and the ephemeral port of a connection, are normalised.
- **A host collected in only one of the two runs** (offline, or added later) is named in a note and its files are not compared.
- **every column** switches all of this off, counts duplicate rows and compares the bytes of collected files.

**Hosts.** Hosts are matched **by name**. When the two sides have **no host in common** (a golden-image baseline against a fleet, two baselines of different machines) the hosts are **pooled** automatically: each collection is compared across all the hosts of each side, and every row lists the hosts that have it. The *Hosts* option can force either way. A recurring hunt's badge shows `+new −gone ~changed`.

## Cross-host comparison

**Results > Cross-host comparison** finds the host that is not like the others. Choose a hunt or response that ran on two or more hosts.

**Overview.** Every collection that came back from two or more hosts is listed with how much it differs: *Differ* (items that are different on different hosts), *Missing on some* (items some hosts do not have), *On one host* (rows only one host has) and the *odd one out*. The most interesting come first. Click one to open it. Times and counters that differ between hosts for no reason are left out of the matching, the same way as in [Diff](#diff).

**Three views of a collection.**

| View | What it shows |
|---|---|
| **Differences** | Drift, by item. Items are found by a key (the collection's `$DiffKey`, or the smallest set of columns that tells rows apart) and grouped by what else is true of them: *Spooler: Running on 4 hosts, Stopped on WIN-WS01 and WIN-WS02*. An item some hosts lack is *Missing on some hosts*, with the hosts that lack it. Items identical everywhere are not listed |
| **Hosts** | Every host ranked by distance from the rest: rows no other host has, items it holds in a state few others do, and common items it lacks. Click a host to see only its differences |
| **Rows** | Every distinct row and how many hosts have it, fewest first, with filters (one host only, rare, every host) |

- **Columns** (under the tabs) shows which columns identify an item and which make two rows the same. Greyed ones were left out (volatile or times); press one to put it back, then **Apply**.
- Filter by text or by host, click a host name anywhere to filter by it, and **Export CSV** writes the current view.
- Workflow output (a Hayabusa timeline per host) is listed alongside the collections.

## IOC lists

**Results > IOC > Add IOC list** lets you upload or paste indicators: IP addresses, domains, hashes, URLs and file names. Each upload is a list shown as a header; under it you see the hunts whose output contains an indicator from that list and the individual files that returned it.

- **Input**: text with one indicator per line, or a CSV (the first column, or a column called `ioc`, `indicator`, `value`, `hash`, `ip`, `domain` or `url`). Blank lines and lines starting with `#` are ignored. Defanged indicators (`hxxp`, `[.]`) are restored.
- **Matching**: hashes, IPs and domains match whole words, so `10.1.1.1` does not match `10.1.1.10`, and a domain also matches its sub-domains. URLs, paths and file names match anywhere in the text. Everything is case-insensitive.
- The combined `All_Hosts` files and the log are left out so each hit is listed once. Results update when a run's files change.
- A hunt can be pinned from here. Needs `hunts.run` to add or delete lists.

## YARA scan

**Results > YARA scan** scans the output of one or more runs with YARA rules, **on the server**: every CSV, every workflow output and every collected file (event logs, hives, memory images, captures). Nothing runs on the hosts, so a run collected last week can be checked against rules written today.

The rule files include the **built-in rules** (marked *built-in*): generic rules such as every Windows or Linux executable, unsigned or packed programs, archives, secrets and web shells. Tick one to scan with it alone; they are disabled for hunts by default.

1. Tick the runs (filter by name) and the rule files to use. The files enabled on [Settings > YARA Rules](08-settings.md#yara-rules) are ticked to start with; disabled ones can be used here too. A file that does not compile cannot be chosen, nor two files that define the same rule name.
2. Press **Scan**. One scan runs at a time; the runs are scanned one after another and the list updates as it goes. **Cancel** stops it.
3. Open a scan to see each run's count, and every match with its rule, run, host (the host folder the file is in) and file. Filter by rule with the chips; **Browse** opens the file's folder. **CSV** exports every match (needs `hunts.export`).

It needs YARA on the server: `yara64.exe` uploaded on [Binaries](08-settings.md#binaries) (Windows server) or `yara` installed (Linux). Files YARA cannot open are counted and skipped. The latest 20 scans are kept, with up to 5,000 matches each. Viewing needs `hunts.view`; scanning, cancelling and deleting need `hunts.run`.

## Baseline

A baseline is a known-good state that later runs, and newer baselines, are compared with. Each has an **operating system** (Windows, Linux or other), and **one baseline per system can be the standard**: the reference for that system.

**Adding one** (**Add baseline**):

- **From a run**: a finished hunt or response is copied (its CSVs and workflow output; collected files such as event logs are left out, and are then left out of comparisons with it too).
- **Upload a baseline**: a zip made by **Download** on another Kookaburrow (so a standard baseline can be built once and shared), a zip of a run folder, or a single CSV, up to 200 MB. The operating system, hosts and collections are recognised from the content, or you can say which system it is.
- Tick **Use as the standard** to make it the reference for its system. **Edit** changes the name, note, system and standard later; **Download** exports it as a zip.

**Seeing what changed.** The table lists each baseline with its system, hosts, collections and rows, and two columns that fill in by themselves: **Changed since the standard** and **Changed since the one before** (the previous baseline of the same system, by date), each as `+new −gone ~changed` and how many collections. *No changes* means identical; times and counters do not count. Click a figure, or the baseline itself, and the **change report** opens below with exactly what is new, gone and changed in each collection, in the same form as [Diff](#diff): persistence and accounts first, fields that changed shown old → new, searchable and exportable.

- **Compare** under the table picks any reference and any newer baseline or run. **Quick compare** offers *newest vs standard* and *newest vs previous* for each system. **Check a run against the standard** compares a run with the standard of its system.
- Baselines of different machines are compared **pooled** (each collection across all the hosts of each side); baselines of the same hosts are compared host by host. The report says which.
- A recurring hunt can compare **every run** with a baseline instead of with the run before: **Burrow! > Recurring**, open the schedule, **Compare each run with**. Deleting a baseline removes its files, and recurring hunts that used it go back to the previous run.
- **Tested** with a six-host fleet audited twice and a golden-image host: changes, hidden noise, pooled comparison, the exported zip re-uploaded as an identical baseline. Not tested with very large baselines (the summary for each pair is computed once and kept until the server restarts).

### Expected changes

Some rows come and go on their own, such as an updater's scheduled task. In a Diff result, press **Expected** on a new or gone row (needs `hunts.run`) and add an optional note. From then on that row is not reported as new or gone, by Diff or by recurring hunts, on **any host** and in every run of that collection. It is matched on the compared columns only, so a new PID does not bring it back. Recurring hunts' counts are worked out again straight away.

The rows are listed under **Expected changes** on the Baseline page, with who marked them; **Remove** reports the row again. Diff shows how many expected rows it left out of each file, and **compare every column** shows them all.

## Browse

**Browse > Files** is a read-only file browser over five roots:

| Root | Contents |
|---|---|
| collections | The shipped and custom collection scripts |
| actions | The action scripts |
| binaries | The uploaded tools |
| output | `hunts/`, `responses/` and `Pulled-Files/` |
| reports | `output/reports` |

It never leaves those folders and does not follow symlinks.

- **Preview**: text, a CSV table, a JSON tree, an XML tree, or a Windows **event log (EVTX)** read in the browser. The *Find in this file* box highlights matches. Large files show the first part and say so.
- **Search**: type text and search folder names, file names and inside text files below the current folder (or every root except binaries). Capped so a huge output folder cannot hang the server.
- **Download** a file, or **Download folder (zip)** (needs `hunts.export`).
- **Pin** a file or folder (or use the star on a row) to keep it in [Pinned](#pinned).
- **Delete** works only for what hunts and responses brought back: a run's folder or anything inside it, a report, or a pulled file. Deleting a whole run's folder also removes it from Results. This cannot be undone. Scripts and binaries have their own pages and are never deleted here.

## Pinned

**Browse > Pinned** keeps files, folders and runs you marked, each with a **note**. A run can also be pinned from Diff and a hunt from IOC. Pins belong to your user: each user has their own list.

## Permissions

| To... | Needs |
|---|---|
| View hunts, logs, results, reports, Browse, pins, Diff, Cross-host comparison, the Baseline and IOC lists | `hunts.view` |
| Generate or download a report, download output, folders and the activity log CSV | `hunts.export` |
| Delete a report or a run, delete files in Browse, add or delete IOC lists and baselines, mark or remove expected changes | `hunts.run` (deleting in Browse also accepts `actions.run`) |
