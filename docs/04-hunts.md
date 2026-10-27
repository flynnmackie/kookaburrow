<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Hosts](03-hosts.md) · Next: [Responses](05-responses.md)

# 4. Hunts

A **hunt** runs read-only **collections** against hosts and keeps what comes back. Responses (which change hosts) are in [Responses](05-responses.md).

- [The New Hunt wizard](#the-new-hunt-wizard)
- [Parameters](#parameters)
- [Quick hunts](#quick-hunts)
- [Rerunning a hunt](#rerunning-a-hunt)
- [Recurring hunts](#recurring-hunts)
- [Following a hunt](#following-a-hunt)
- [Cancelling a hunt](#cancelling-a-hunt)
- [How a hunt runs](#how-a-hunt-runs)
- [Large file transfers](#large-file-transfers)
- [Output layout](#output-layout)
- [Statuses](#statuses)
- [Limits](#limits)

## The New Hunt wizard

**Burrow! > Hunt > New Hunt** has five steps. You can move between them with the tabs at the top.

1. **Who.** Tick **Groups** and/or individual **Hosts**. A host in several chosen groups is run once.
2. **Collections.** Choose the **PowerShell** or **Linux** list, then tick collections.
   - Search the names and the script text, filter by tag or by type.
   - A star marks your **favourites** (kept per user) so they are easy to find.
   - A collection that needs a [binary](08-settings.md#binaries) you have not uploaded is greyed out and says what is missing.
   - PowerShell collections are for Windows hosts and Linux collections for SSH hosts. Pick collections that match the hosts you chose: a collection run on the wrong kind of host fails and is recorded as an error.
3. **Parameters.** Only shown when a chosen collection takes parameters. Collections that need them are red, ones with optional parameters are orange, ones that are set are green. Press **Set parameters** when done. A red collection cannot be run.
4. **Automation.** What happens after and around the hunt:
   - **Workflow**: attach a [workflow](07-workflows-and-recurring.md) (shown when you may run workflows). Choosing one also ticks the collections it is meant for. A workflow whose tools are not uploaded shows why and **cannot be run**: the hunt is refused before it starts.
   - **Send results to Elastic**: on or off for this hunt. It starts at the default set in [Settings > Elastic](10-elastic.md#configuring-kookaburrow) and is greyed out until Elastic is set up. When on, the rows each host returns, and any workflow output, are sent.
   - **Recurring hunt**: repeat the hunt, see [below](#recurring-hunts).
5. **Overview.** Name the hunt (required) and check the summary: *Will run against*, *Collections to run*, the **workflow** (or none), whether and how often it **repeats**, and where the results are **sent** (Elastic server or not sent). Collections that pull large files show a warning that SMB will be switched on temporarily (see [large transfers](#large-file-transfers)). Press **Run Hunt**.

The name is used in the output folder name, so choose something you will recognise later.

## Parameters

A collection lists the inputs it takes in its metadata (`$Parameters = @('LogName', 'LastMinutes?')`; a trailing `?` makes one optional). Values are typed on the Parameters step.

- Values are put on the first lines of a temporary copy of the script as variables. The copy is deleted afterwards.
- Parameter values are **not** stored with the hunt or written to logs.
- For recurring hunts the values are needed to run unattended, so they are kept [encrypted](11-security.md#credentials) in the schedule and never shown again.
- Event log collections take `LastMinutes`, or `StartTime` and `EndTime` (`yyyy-MM-dd HH:mm`), and default to the last 24 hours.

## Quick hunts

From the [Shell](03-hosts.md#shell) page you can start a hunt on the **one host you have open**. The dialog has no Who step, no Rerun and no recurring switch, and opens on that host's kind of collections (PowerShell for WinRM, Linux for SSH). These runs are marked **Q** in the hunt list.

## Rerunning a hunt

In the New Hunt dialog press **Rerun past hunt**, pick an earlier hunt, and its hosts and collections are ticked and the name becomes `<name>_rerun`. You then check the details (and re-enter any parameters) and run it.

## Recurring hunts

Turn on **Recurring hunt** on the Automation step:

| Option | Meaning |
|---|---|
| Run every | A number of minutes (default 60) |
| Until | A date and time, or *indefinitely* until you delete it |

The dialog tells you how many runs that makes. The hunt runs **now**, then every interval. Each run is an ordinary hunt record marked with a green **R**. Runs missed while the server was off are not made up (at most one run happens when it is back). Manage schedules under [Burrow! > Recurring](07-workflows-and-recurring.md).

## Following a hunt

**Burrow! > Hunt** lists **Previous hunts** (newest first) with a status, and tags **Q** (quick), a green **R** (recurring) and an amber **W** (ran with a workflow; a recurring hunt with a workflow shows both). Select one:

The box under the list has four tabs:

- **About**: how the hunt was set up, not what it returned. Name, type (single run, quick or recurring), who started it and when (by hand or by its schedule), the number of hosts and collections, the workflow (with the steps it ran) and whether results were sent to Elastic. A recurring hunt also shows its schedule: runs every, until, runs so far of the planned total, status and next run (or that the schedule has since been deleted). It lists the collections run with their parameter *names* (values are not kept) and the hosts it ran on. Older hunts that predate the Elastic setting show *Not recorded*.
- **Details**: how the run went. Status, start, finish and elapsed time, the error count, and the Elastic result. **Progress by host** shows a summary bar (with the per-host table while the hunt runs, or when a host failed or was cancelled), then the workflow stages and what each collection returned on each host. An **Error log** appears only when something went wrong.
- **Files**: the files it produced per host, with **Download all (zip)** for the whole folder and per-file downloads (needs `hunts.export`).
- **Notebook**: the hunt's JSON to scroll through.
- The list refreshes by itself while a hunt is running.

The hunt's [Activity log](06-results.md#activity-log), [JSON](06-results.md#json), [report](06-results.md#report) and files in [Browse](06-results.md#browse) are the other ways in.

## Cancelling a hunt

While a hunt is running, **Cancel** (in its detail) asks for confirmation. Cancelling:

- cuts off the host being worked on, stopping its collection and any file transfer, and cleaning up its temporary folder on the host
- skips collections that have not started
- **keeps** everything already collected

The hunt ends as *Cancelled*. Needs `hunts.run`.

## How a hunt runs

1. For each host (several at once, see [Run Settings](08-settings.md#run-settings)) the collections run **one after another**.
2. For each collection the server connects, stages any [dependencies](09-library.md#dependencies) in a temporary folder on the target, runs the script, collects its output and removes the folder.
3. Output is converted to a CSV, saved per host, and counted as rows. A collection that errors is recorded as an error; the rest continue.
4. Every step is written to the [activity log](06-results.md#activity-log) with the SHA-256 of what was received.
5. If a [workflow](07-workflows-and-recurring.md) is attached, its steps now run on the server over the files that came back; the hunt stays *Running* until they finish.
6. When all hosts finish the server writes `All_Hosts.csv` and `All_Hosts.json`, sets the final status, and (if [Elastic](10-elastic.md) forwarding is on) the rows are sent as each result arrives.

Windows collections run through WinRM (PowerShell remoting with NTLM and message encryption). Linux collections are streamed to the shell over SSH, so nothing is written to the target. Credentials are passed by environment variable, never on a command line.

## Large file transfers

A collection with `$Transfer = 'large'` writes files into a folder on the host (`$OutDir`, or `$OUT_DIR` in bash) and the server pulls them back into `<host folder>/raw/<collection>/`, then removes them from the host. Each file's SHA-256 on the host and on the server is compared and logged. Examples: Prefetch, registry hives, event logs, SRUM, jump lists, browser data, memory images, packet captures.

**Windows hosts: SMB**
1. The Server service and the *File and Printer Sharing (SMB-In)* firewall rule are turned on only if they were off, limited to the address the host sees this server connect from.
2. The server waits for port 445, connects to `\\host\C$` with the host's saved credentials and pulls the files.
3. The service and rule are put back exactly as they were, and the server checks that port 445 no longer answers. If SMB was already on, it is left as found.

**Linux hosts: SFTP** over the existing SSH connection. Nothing is opened.

Requirements: the account must reach `C$` (administrator; a local account also needs `LocalAccountTokenFilterPolicy`), the server must reach TCP 445, and the server's SMB client must not be disabled. How many hosts pull files at once is limited by **Large file transfers at once** in Run Settings (default 2); extra hosts show *Waiting*. Hunts only; responses do not use this yet.

## Output layout

Under the data folder (`C:\ProgramData\Kookaburrow\output` for the MSI install, `output/` from source):

```
output/
  hunts/
    H_<name>_<YYYYMMDD_HHMM>/
      H_<name>_<date>_Log.csv              the activity log
      H_<name>_<date>_All_Hosts.csv        every host's rows, with the target IP added to each row
      H_<name>_<date>_All_Hosts.json       the run's details and the data as records
      H_<name>_<date>_<IP>/                one folder per host
        <collection>_<date>_<IP>.csv       one CSV per collection
        raw/<collection>/...               raw artefacts, only for large-transfer collections
        processed/<processor>/...          what a workflow's processors produced (only when a workflow ran)
  responses/
    R_<name>_<date>/...                    the same layout for responses
  reports/
    H_<name>_<date>_Report.html            HTML reports
  Pulled-Files/                            files pulled from a shell
```

The activity log is appended as each step happens, so it exists outside the platform even if the server stops mid-run.

## Statuses

| Status | Meaning |
|---|---|
| Running | In progress |
| Completed | Every collection ran without error |
| Completed with errors | At least one collection failed; the rest are kept |
| Cancelled | Stopped by a user |
| Failed | The hunt itself failed (for example a bad request) |
| Interrupted | The server restarted while it was running; it is marked and not resumed |

## Limits

- One collection on one host may run for up to 10 minutes (large transfers up to 6 hours).
- Output captured from a collection is capped at 5 MB; more is cut off and the log records a warning. Use a large-transfer collection for big data.
- Collections run read-only by design. Some stage a small tool on the host temporarily (`Footprint: transient`); the collection list shows which.
