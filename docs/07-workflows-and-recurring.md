<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Results and analysis](06-results.md) · Next: [Settings](08-settings.md)

# 7. Workflows and recurring runs

- [Workflows](#workflows)
- [Processors](#processors)
- [Shipped workflows](#shipped-workflows)
- [Eric Zimmerman tools](#eric-zimmerman-tools), [Chainsaw and Zircolite](#chainsaw-and-zircolite), [Zeek](#zeek)
- [Building a workflow](#building-a-workflow)
- [Running a workflow](#running-a-workflow)
- [Writing a processor](#writing-a-processor)
- [Recurring runs](#recurring-runs)

## Workflows

A **workflow** is a saved recipe that follows a hunt: **collect** artefacts, **process** them with a server-side tool, **send** the results on.

```
hunt collects raw files ──▶ processor runs on the server ──▶ results saved in the hunt folder ──▶ sent to Elastic
 (Event Logs - Export)        (Hayabusa over the .evtx)        (<host>/processed/hayabusa/)
```

Workflows live under **Burrow! > Workflow**. A workflow is not a separate kind of run: you **attach it to a hunt** with **Workflow** on the Automation step of the New Hunt dialog (or press **Run on a hunt** on the workflow, which opens the dialog with it chosen). The hunt runs as normal; when every host has finished collecting, the workflow's steps run over what came back.

### How hunts and processors match

Hunts do not need to know about workflows. Compatibility is worked out from two declarations:

- A **collection** declares the kinds of raw file it leaves behind: `$Produces = @('evtx')` ([The library](09-library.md#metadata)). The kinds in use: `evtx`, `prefetch`, `registry` (hives, including Amcache.hve), `jumplists`, `lnk`, `recyclebin`, `srum`, `timeline`, `mft` and `pcap`. See the table in [The library](09-library.md#metadata).
- A **processor** declares the kinds it accepts: `"accepts": ["evtx"]`.

A step runs on a host only if the hunt ran a collection that produces something the step's processor accepts, and that collection left files on that host. The workflow editor warns when the chosen collections and steps do not match, and refuses to save a step whose input no chosen collection produces.

## Processors

**Burrow! > Workflow** lists the installed **processors** with their state:

| State | Meaning |
|---|---|
| **Ready** | The tool archive has been uploaded |
| **Needs hayabusa.zip** | Upload it under [Settings > External > Binaries](08-settings.md#binaries) (the processor adds its tool to that list) |
| **Not available on this server** | The processor has no tool for this server's operating system |

A processor is a manifest in `processors/`, not a script. It names the tool, the arguments (with named parameters), what it reads and what it writes. The tool is started directly, never through a shell, with a time limit, and is killed if the hunt is cancelled. Parameter values are checked against the manifest (a list of allowed options, or a safe character set) before use.

The tool archive is unpacked once per version into `data/tools/<processor>/` and run from there, so rules and config files next to the program are found.

Shipped processors:

| Processor | Reads | Tool | Output |
|---|---|---|---|
| **Hayabusa - Event Log Timeline** | `evtx` | `hayabusa.zip`: the Windows release zip of [Hayabusa](https://github.com/Yamato-Security/hayabusa) (it holds the program and its `rules/`). Tested manifest targets Hayabusa 4.x (`dfir-timeline`). Hayabusa is AGPL-3.0 and is not shipped with Kookaburrow | `hayabusa-timeline.csv` |
| **Chainsaw - Event Log Hunt** | `evtx` | `chainsaw.zip`: the *all_platforms+rules* zip of [Chainsaw](https://github.com/WithSecureLabs/chainsaw) (programs for every platform, Chainsaw rules and Sigma rules). No runtime needed | CSV detections, one file per rule group (`sigma.csv`, `powershell_script.csv`, ...) |
| **Zircolite - Sigma Timeline** | `evtx` | `zircolite.zip` (Windows) or `zircolite-linux.zip`: the release zip of [Zircolite](https://github.com/wagga40/Zircolite) with its rules. No runtime needed. Parameter **Rule set** | `zircolite-timeline.csv`: detections in time order |
| **EvtxECmd - Event Log Parser** | `evtx` | `EvtxECmd.zip` | `evtxecmd.csv`: one row per event, with the maps' normalised fields |
| **PECmd - Prefetch Parser** | `prefetch` | `PECmd.zip` | `pecmd.csv` (one row per program) and a run timeline |
| **RECmd - Registry Batch Parser** | `registry` | `RECmd.zip` (with its `BatchExamples` folder) | `recmd.csv`: the keys and values the batch file selects. Parameter **Batch file** (default `Kroll_Batch.reb`) |
| **SBECmd - ShellBags Parser** | `registry` | `SBECmd.zip` | CSV of the folders each user browsed (reads NTUSER.DAT and UsrClass.dat) |
| **AmcacheParser - Amcache Parser** | `registry` | `AmcacheParser.zip` | CSVs of programs and drivers from `Amcache.hve` (one run per Amcache.hve found) |
| **AppCompatCacheParser - Shimcache Parser** | `registry` | `AppCompatCacheParser.zip` | `shimcache-<n>.csv` from the SYSTEM hive (one run per hive named SYSTEM) |
| **JLECmd - Jump List Parser** | `jumplists` | `JLECmd.zip` | `jlecmd.csv` |
| **LECmd - Shortcut (LNK) Parser** | `lnk` | `LECmd.zip` | `lecmd.csv` |
| **RBCmd - Recycle Bin Parser** | `recyclebin` | `RBCmd.zip` | `rbcmd.csv` |
| **SrumECmd - SRUM Parser** | `srum` | `SrumECmd.zip` | CSVs per SRUM table (reads SRUDB.dat and the SOFTWARE hive) |
| **WxTCmd - Windows Timeline Parser** | `timeline` | `WxTCmd.zip` | CSVs per user (`user<n>/`), one run per ActivitiesCache.db |
| **MFTECmd - MFT and USN Journal Parser** | `mft` | `MFTECmd.zip` | `mftecmd-<n>-<name>.csv` for each `$MFT` and `$J` found. Can be several GB |
| **Zeek - Network Log Analysis** | `pcap` | **Installed on the server** (Linux only), not uploaded. See [Zeek](#zeek) | Zeek logs (`conn.log`, `dns.log`, `http.log`, ...) in `capture<n>/`, one folder per capture |

The tools marked *.zip* from Eric Zimmerman need the .NET 10 runtime on the server (see [Eric Zimmerman tools](#eric-zimmerman-tools)).

Parameter: **Minimum alert level** (`informational`, `low`, `medium`, `high`, `critical`; default `informational`).

## Shipped workflows

Kookaburrow ships these (marked *Shipped*, read-only; **Copy** one to change it). Each needs its tool uploaded under External > Binaries, and the Eric Zimmerman ones also need the .NET 10 runtime ([External > Dependencies](08-settings.md#dependencies)).

| Workflow | Collects | Then runs |
|---|---|---|
| **Event Logs - Hayabusa Timeline** | Event Logs - Export | Hayabusa |
| **Event Logs - EvtxECmd Parse** | Event Logs - Export | EvtxECmd |
| **Prefetch - PECmd Parse** | Prefetch - Collect | PECmd |
| **Registry - RECmd Kroll Batch** | Registry - Collect Hives | RECmd with `Kroll_Batch.reb` |
| **Triage - Eric Zimmerman Tools** | Triage - Windows Core | EvtxECmd, PECmd, then RECmd |
| **Event Logs - Chainsaw Hunt** | Event Logs - Export | Chainsaw |
| **Event Logs - Zircolite Sigma** | Event Logs - Export | Zircolite |
| **Jump Lists - JLECmd Parse** | Jump Lists - Collect | JLECmd |
| **Recent Files - LECmd Parse** | Recent Files - Collect | LECmd |
| **Recycle Bin - RBCmd Parse** | Recycle Bin - Collect | RBCmd |
| **SRUM - SrumECmd Parse** | SRUM - Collect | SrumECmd |
| **Windows Timeline - WxTCmd Parse** | Windows Timeline - Collect | WxTCmd |
| **Execution - Amcache, Shimcache and ShellBags** | Registry - Collect Hives | AmcacheParser, AppCompatCacheParser, SBECmd |
| **Filesystem - MFT and USN Journal (KAPE)** | KAPE - SANS Triage | MFTECmd |
| **Network - Zeek on Packet Capture** | Network - Packet Capture (Windows or Linux) | Zeek |

### Eric Zimmerman tools

- Download the tools from [ericzimmerman.github.io](https://ericzimmerman.github.io/). The tools come in two builds. **Use the .NET 10 build**: its links point at `https://download.ericzimmermanstools.com/net/<Tool>.zip` (for example `.../net/EvtxECmd.zip`). The links without `/net/` are the .NET Framework 4.7.2 build, which Kookaburrow cannot run (and which does not run on Linux); the stage fails with a message saying so.
- Upload the zip unchanged under **Settings > External > Binaries**, using the name shown (`EvtxECmd.zip`, `PECmd.zip`, `RECmd.zip`, `MFTECmd.zip` and so on). The zips stay zips because the tools need the folders next to them (EvtxECmd's `Maps`, RECmd's `BatchExamples`).
- Install the **.NET 10 runtime** (not the SDK) on the server. [External > Dependencies](08-settings.md#dependencies) shows whether it is found and how to install it. The same zips run on Windows and Linux servers, because Kookaburrow starts them as `dotnet <tool>.dll`.
- These tools write times in UTC. When results are sent to Elastic they are stored as UTC in `@timestamp`. For MFTECmd, AmcacheParser and WxTCmd, whose CSVs have several time columns, `@timestamp` is the time of the hunt and every time column stays in the document.
- Tested: EvtxECmd over real event logs, and every other tool started with the arguments the processor uses (on empty folders, and on files that are not real artefacts). **Not tested against real collected artefacts**: PECmd, RECmd, SBECmd, JLECmd, LECmd, RBCmd, SrumECmd, MFTECmd, AmcacheParser, AppCompatCacheParser and WxTCmd. The time columns named for JLECmd, LECmd, RBCmd, SrumECmd and AppCompatCacheParser are from the tools' documented output; if one is wrong the documents get the hunt time instead.

### Chainsaw and Zircolite

- Neither needs a runtime. Both ship their detection rules in the download.
- **Chainsaw**: download `chainsaw_all_platforms+rules.zip` from the [releases](https://github.com/WithSecureLabs/chainsaw/releases) and upload it as `chainsaw.zip`. The same zip serves Windows and Linux servers. The Sigma rules in it are used as shipped; to use newer ones, rebuild the zip with a fresh `sigma/` folder.
- **Zircolite**: upload the Windows zip as `zircolite.zip`, or the Linux zip as `zircolite-linux.zip` (the file you pick is stored under that name whatever it was called). Parameter **Rule set** picks which bundled rules file is used.
- Tested: both ran through Kookaburrow over real Sysmon attack samples (Chainsaw wrote detections, Zircolite wrote a timeline) on a Windows server. Not tested on Linux.

### Zeek

- **Zeek is installed on the server**, not uploaded, and runs on **Linux only** (it has no native Windows build). On a Windows server the Zeek processor and the Zeek workflow show *Cannot run*.
- [External > Dependencies](08-settings.md#dependencies) checks for `zeek` on the PATH and in `/opt/zeek/bin` (where the official packages install it) and shows the install commands.
- For every capture file (`.pcap`, `.pcapng`, `.cap`) the hunt returned, Zeek runs as `zeek -C -r <file>` (`-C` skips checksum checks, which captures taken on the host itself fail) into its own `capture<n>/` folder under `<host folder>/processed/zeek/`.
- Sent to Elastic, each Zeek log becomes its own index (`<prefix>-zeek-network-log-analysis-conn`, `-dns`, `-http`, ...), with `@timestamp` from Zeek's `ts` column (the packet time, not the hunt time). Zeek's default tab-separated logs are converted for you.
- The packet captures come from **Network - Packet Capture** (Windows: `pktmon`, writing pcapng; Linux: `tcpdump`).
- **Not tested with Zeek itself.** The pieces around it (per-file runs, per-capture folders, Zeek log counting, conversion, per-log indexes and time stamps) were tested with a stand-in program that writes Zeek-format logs.

### Archives from collections

A collection that returns a `.zip` (KAPE returns one) has it unpacked before the processors run. The unpacked copy is removed when the stage ends.

### Hayabusa

The first shipped workflow is **Event Logs - Hayabusa Timeline**:

1. Collect: **Event Logs - Export** (exports the `.evtx` files and pulls them back over SMB or SFTP).
2. Process: **Hayabusa - Event Log Timeline**, minimum level `informational`.
3. Send: the hunt's **Send results to Elastic** switch decides whether the timeline goes to Elastic.

To use it:
1. Upload `hayabusa.zip` under Settings > External > Binaries.
2. Optionally set up [Elastic](10-elastic.md).
3. **Burrow! > Workflow**, open the workflow, press **Run on a hunt**, choose hosts, check the Automation step and run.

Whether the timeline is sent is the hunt's **Send results to Elastic** switch (on the Automation step), not the workflow's. If it is off, or Elastic is not set up, the timeline stays in the hunt folder.

## Building a workflow

**New Workflow** (needs `workflows.manage`):

| Field | Meaning |
|---|---|
| Name, Description | Name is required and unique, up to 80 characters |
| Collections | The collections that produce files (only those are listed). They are ticked for you when the workflow is chosen on a hunt, and are what the steps are checked against |
| Steps | Run in order on the server. Each step is a processor and its parameters. **Add step** / **Remove** |

Shipped workflows cannot be edited or deleted. **Copy** makes an editable one. Custom workflows can be edited and deleted.

## Running a workflow

When a hunt has a workflow attached:

1. The hunt collects as usual. It stays *Running* until post-processing finishes.
2. For each host, step and matching collection a **stage** runs: the processor reads `<host folder>/raw/<collection>/` and writes into `<host folder>/processed/<processor>/`.
3. If the hunt's **Send results to Elastic** switch is on, the output CSV rows are sent. Events are indexed with `@timestamp` taken from the tool's time column (for Hayabusa, `Timestamp`), plus `kookaburrow.workflow` and `kookaburrow.processor`, in an index named after the processor (for example `kookaburrow-hayabusa-event-log-timeline`).
4. Every stage is written to the [activity log](06-results.md#activity-log), and shown on the hunt (**Burrow! > Hunt**, select the hunt, **Workflow** table: host, step, input, status, rows, detail).

Behaviour to know:
- **A failed stage does not fail the hunt.** The stage shows *Failed* with the first lines of the error (tool missing, tool exit code, time limit), the other stages continue, and the collected evidence is kept.
- **Cancelling** the hunt stops the running tool and marks the remaining stages cancelled.
- **Missing tools stop the hunt before it starts.** If a step's tool archive is not uploaded (for example `hayabusa.zip`), or the processor is not available on this server, the workflow shows *Cannot run* with the reason, and a hunt with that workflow is refused with the same message. Nothing is collected until the tool is uploaded. (A recurring hunt whose tool is later removed records the error on the schedule and skips that run.)
- If nothing the hunt collected matches a step, the workflow records *Nothing to process* and ends.
- A processor's CSV output over 300 MB is kept on disk but not sent to Elastic (the stage says so).
- Workflows are not available on quick hunts. A workflow can be attached to a **recurring** hunt; the schedule shows its name.
- Needs `workflows.run` (and `hunts.run` for the hunt). Viewing needs `workflows.view`.

## Writing a processor

Add a JSON file to `processors/` (it is read when the server starts):

```json
{
  "id": "my-tool",
  "name": "My Tool - Description",
  "description": "What it does.",
  "accepts": ["evtx"],
  "requires": ["dotnet10"],
  "launcher": "dotnet",
  "tool": {
    "win32": { "archive": "my-tool.zip", "exe": "mytool-*.exe" },
    "linux": { "archive": "my-tool-linux.zip", "exe": "mytool-*" }
  },
  "parameters": [
    { "name": "Level", "label": "Minimum level", "default": "low", "options": ["low", "high"] }
  ],
  "command": ["scan", "--input", "{input}", "--out", "{output}/result.csv", "--level", "{Level}"],
  "outputs": [{ "file": "result.csv", "format": "csv", "timeColumn": "Timestamp" }],
  "timeoutMinutes": 60
}
```

- `archive` is the file you upload under External > Binaries (it appears there automatically). It is normally a zip of the tool; `exe` is a pattern for the program inside it.
- `requires` (optional) lists [server dependencies](08-settings.md#dependencies) that must be installed, for example `dotnet10`. While one is missing the workflow cannot run. `launcher: "dotnet"` runs the tool as `dotnet <file>` (for `.dll` tools); the tool is started with `DOTNET_ROOT` set to the runtime found and `DOTNET_ROLL_FORWARD=Major`, so a newer runtime than the tool was built for still works.
- `each` (optional) is a list of file name patterns, for tools that read one named file (`["Amcache.hve"]`, `["$MFT", "$J"]`, `["*.pcap"]`). The command then runs once per matching file below the input folder, with `{file}` (the path), `{n}` (1, 2, ...) and `{name}` (the file name made safe) available, so the outputs of different files do not overwrite each other. If no file matches, the stage records a note and succeeds.
- `cwd` (optional) is the folder the tool runs in (it may use `{output}` and `{n}`); the default is the folder the tool is in. Zeek writes its logs into the current folder, so it uses `{output}/capture{n}`.
- `tool` can be `{ "system": "zeek" }` instead of `archive` and `exe`: the program installed on the server and found by [Dependencies](08-settings.md#dependencies) (the id must also be in `requires`).
- `outputs` entries may match files in sub-folders (`capture*/*.log`) and use `"format": "zeek"` for Zeek's tab-separated logs; `"timeEpoch": true` says the time column is seconds since 1970.
- `{input}` is the folder of raw files, `{output}` the folder to write into, `{Name}` a parameter value.
- Parameters take `options` (a fixed list) or free text limited to letters, digits and `. _ : , @ + - space`.
- `timeColumn` (optional) names the CSV column that holds each row's event time; `timeUtc: true` says those times are UTC without a zone (as the Eric Zimmerman tools write them). `file` may use `*` for tools that add a time stamp to their output names.
- The `accepts` kinds must match a collection's `$Produces`.

## Recurring runs

A recurring run repeats a hunt or response on a timer. Create one by turning on **Recurring** in the New Hunt or New Response dialog ([Hunts](04-hunts.md#recurring-hunts), [Responses](05-responses.md#recurring-responses)).

### How it behaves

- It runs **immediately**, then again every *N* minutes until the end time passes, or **indefinitely** until you delete it.
- Each run is an ordinary hunt or response record with its own output folder, tagged with a green **R** in the Hunt and Respond lists.
- Targets are stored as the hosts and groups you chose. A group is resolved **when each run starts**, so hosts added to the group later are included.
- **Missed runs are not made up.** If the server was off, at most one run happens when it is back.
- Parameter values are kept in the schedule **encrypted** (they are needed to run unattended) and are never shown again.
- A recurring hunt with a workflow attached runs the workflow after every run.
- The schedule is checked against the server's clock.

### The Recurring page

**Burrow! > Recurring** has a **Hunts / Actions / Workflows** toggle in the header. Each schedule is a collapsible row:

- **Header:** name, a status badge (*Active*, *Paused* or *Finished*), how many times it ran, when it last ran, and a live countdown to the next run (or *Paused: no runs until resumed* / *No more runs*).
- **Details** (open the row): runs every, until, planned runs, ran so far, the workflow (if any), who created it and when, the collections or actions with their parameter names, the hosts and groups, and the latest runs with their status.
- **Pause** holds it: nothing runs until you **Resume**, which starts a fresh cycle (the next run is one interval from now, or it finishes if its end time has passed). The runs it already made are kept.
- **Delete** stops it for good. The runs it already made are kept.

Pausing, resuming and deleting need `hunts.run` for hunt schedules and `actions.run` for response schedules. Viewing needs `hunts.view` or `actions.view`.

The **Workflows** option on the toggle is a placeholder: workflows are scheduled by attaching them to a recurring hunt, so there are no separate workflow schedules.
