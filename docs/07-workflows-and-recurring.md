<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Results and analysis](06-results.md) · Next: [Settings](08-settings.md)

# 7. Workflows and recurring runs

- [Recurring runs](#recurring-runs)
- [Workflows](#workflows)

## Recurring runs

A recurring run repeats a hunt or response on a timer. Create one by turning on **Recurring** in the New Hunt or New Response dialog ([Hunts](04-hunts.md#recurring-hunts), [Responses](05-responses.md#recurring-responses)).

### How it behaves

- It runs **immediately**, then again every *N* minutes until the end time passes, or **indefinitely** until you delete it.
- Each run is an ordinary hunt or response record with its own output folder, tagged with a green **R** in the Hunt and Respond lists.
- Targets are stored as the hosts and groups you chose. A group is resolved **when each run starts**, so hosts added to the group later are included.
- **Missed runs are not made up.** If the server was off, at most one run happens when it is back.
- Parameter values are kept in the schedule **encrypted** (they are needed to run unattended) and are never shown again.
- The schedule is checked against the server's clock.

### The Recurring page

**Burrow! > Recurring** has a **Hunts / Actions / Workflows** toggle in the header. Each schedule is a collapsible row:

- **Header:** name, a status badge (*Active*, *Paused* or *Finished*), how many times it ran, when it last ran, and a live countdown to the next run (or *Paused: no runs until resumed* / *No more runs*).
- **Details** (open the row): runs every, until, planned runs, ran so far, who created it and when, the collections or actions with their parameter names, the hosts and groups, and the latest runs with their status.
- **Pause** holds it: nothing runs until you **Resume**, which starts a fresh cycle (the next run is one interval from now, or it finishes if its end time has passed). The runs it already made are kept.
- **Delete** stops it for good. The runs it already made are kept.

Pausing, resuming and deleting need `hunts.run` for hunt schedules and `actions.run` for response schedules. Viewing needs `hunts.view` or `actions.view`.

The **Workflows** option on the toggle is a placeholder: scheduling workflows is not available yet.

## Workflows

> **Status: skeleton.** You can create, list and delete workflows, but they have no steps and nothing runs them yet. This section describes what exists and the intended direction.

**Burrow! > Workflow** lists saved workflows.

| Action | Detail |
|---|---|
| **New Workflow** | A name (required, unique, up to 80 characters) and an optional description (up to 500) |
| **Delete** | Removes the workflow |
| Permissions | `workflows.view` to see them, `workflows.manage` to create and delete, `workflows.run` reserved for running them |

A saved workflow records its name, description, creator and creation time, and an empty list of steps.

### Intended design

A workflow is a saved recipe that follows a hunt:

1. **Collect**: a hunt that returns artefacts (for example raw event logs from *Event Logs - Export*).
2. **Process**: server-side tools run on what was collected, for example Hayabusa over the pulled `.evtx` files.
3. **Send**: the results go to a destination such as [Elastic](10-elastic.md) or Splunk.

Planned properties: reusable and attachable to a hunt (including recurring hunts), per-host stage status in the progress view, processors that are verified library items rather than free-text command lines, timeouts and output limits, and results saved in the run folder with hashes and logged like everything else.
