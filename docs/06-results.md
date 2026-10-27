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

**Results > Diff** compares the output of two runs, or one file from each.

- Pick run **A** and run **B** (typically the same hunt on two dates), or choose a single file in each.
- Files are paired by their **path inside the run**; the date stamps in names are ignored, so one hunt's files line up with the next run of the same hunt.
- Content is compared **by line**, or **by row for CSV**, ignoring order.
- You see what is only in **A** (gone) and what is only in **B** (new), and how many are in both. Select a changed file to see the rows behind it.
- A run can be pinned from here.

## Cross-host comparison

**Results > Cross-host comparison** puts one hunt's CSV from **every host** side by side so rare things stand out.

1. Choose a hunt or response. Only runs with results from two or more hosts are listed.
2. Choose a CSV, listed with how many of the run's hosts returned it.
3. Press **Compare**.

Each row of the CSV is counted by how many hosts have it. Rows are ordered from the **fewest hosts to the most**, so a service, port or autorun found on one host out of forty comes first. You can choose which columns identify a row (default all columns).

## IOC lists

**Results > IOC > Add IOC list** lets you upload or paste indicators: IP addresses, domains, hashes, URLs and file names. Each upload is a list shown as a header; under it you see the hunts whose output contains an indicator from that list and the individual files that returned it.

- **Input**: text with one indicator per line, or a CSV (the first column, or a column called `ioc`, `indicator`, `value`, `hash`, `ip`, `domain` or `url`). Blank lines and lines starting with `#` are ignored. Defanged indicators (`hxxp`, `[.]`) are restored.
- **Matching**: hashes, IPs and domains match whole words, so `10.1.1.1` does not match `10.1.1.10`, and a domain also matches its sub-domains. URLs, paths and file names match anywhere in the text. Everything is case-insensitive.
- The combined `All_Hosts` files and the log are left out so each hit is listed once. Results update when a run's files change.
- A hunt can be pinned from here. Needs `hunts.run` to add or delete lists.

## Baseline

**Results > Baseline > Upload baseline** stores a known-good scan (for example the output of the *Baseline - Windows Full* collection) under a name, with its SHA-256. Baselines are **stored only**: comparing later hunts against them is not available yet. Use [Diff](#diff) between two runs of the baseline collection in the meantime.

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
| Delete a report or a run, delete files in Browse, add or delete IOC lists and baselines | `hunts.run` (deleting in Browse also accepts `actions.run`) |
