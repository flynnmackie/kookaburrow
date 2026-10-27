<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Hunts](04-hunts.md) · Next: [Results and analysis](06-results.md)

# 5. Responses

A **response** runs **actions** on hosts. Unlike collections, actions **change** the host: kill a process, disable an account, block an address, isolate the machine, install an agent.

- [Running a response](#running-a-response)
- [What the actions cover](#what-the-actions-cover)
- [Actions that can cut you off](#actions-that-can-cut-you-off)
- [Deploy actions](#deploy-actions)
- [Cancelling a response](#cancelling-a-response)
- [Following a response](#following-a-response)
- [Recurring responses](#recurring-responses)
- [Good practice](#good-practice)

## Running a response

**Burrow! > Respond > New Response** is the same four-step wizard as hunts: **Who**, **Actions**, **Parameters**, **Overview**. Differences:

- Most actions need parameters (a process name, a user, an address). Fill them in on the Parameters step; red means required.
- Pressing **Run Response** asks for confirmation: *"Run N actions on H hosts? Actions change the hosts they run on."*
- **Rerun past response** reuses an earlier response's hosts and actions (parameters are entered again).
- Running needs `actions.run`; viewing needs `actions.view`.
- Parameter values are not stored with the response or logged.
- Actions that deploy software need their installers uploaded first, see [Upload Binaries](08-settings.md#upload-binaries).

Hosts are processed several at once and each host's actions run one after another, the same as hunts. Responses use the **Respond** history list, with the same per-host progress.

## What the actions cover

About 120 actions, each in a Windows (PowerShell) and/or Linux (bash) version. Names are `Area - Thing`. Windows versions unless marked.

| Area | Actions |
|---|---|
| Accounts | Disable Guest, Enable/Disable/Create/Remove User, Force Password Change, Reset Password, Add to / Remove from Group, Log Off Session / User. Linux: Lock/Unlock User, Delete User, Disable/Restore Login Shell, Kill Sessions, Remove Sudoers File |
| Processes | Kill by Name, Kill by PID, Kill Tree, Suspend, Resume (Windows and Linux) |
| Services | Start, Restart, Stop and Disable, Set Startup Type, Delete (Windows); Start, Restart, Stop and Disable (Linux) |
| Tasks, WMI, Persistence | Task Delete/Disable, WMI Remove Subscription, Remove Run Entry, BITS Cancel Jobs; Linux: Cron Remove Entry / Disable File, Systemd Remove Unit, Clear ld.so.preload |
| Files | Quarantine, Restore Quarantined, Delete (Windows and Linux); Linux: Set/Clear Immutable, Remove Execute Permission |
| Registry | Set Value, Delete Value, Delete Key |
| Network and firewall | Block/Unblock Address and Port (Windows and Linux), Disable/Enable Adapter, Interface Up/Down (Linux), Hosts File Add/Remove Entry, DNS Flush Cache |
| Containment | **Host - Isolate**, **Host - Release** (Windows and Linux) |
| Host | Restart, Shutdown, Cancel Shutdown (Linux: Reboot, Power Off) |
| Defender and hardening | Defender Scan, Update Signatures, Enable Protection, Remove Exclusion; Disable SMBv1, Require SMB Signing, Disable LLMNR and NetBIOS, Enable LSA Protection, Disable RDP, USB Block/Allow Storage; Linux: Apply/Remove Kernel Hardening, SSH Disable Password Login, Disable Root Login, Remove Authorized Key, Remove Overrides |
| Logging | Enable PowerShell Logging, Enable Process Auditing, Set Log Size; Linux: Make Journal Persistent |
| Software and containers | Software Uninstall (Linux: Remove Package), Kernel Unload Module, Containers Stop / Remove (Linux) |
| Deploy | Velociraptor, Sysmon, Elastic Agent (Windows and Linux), see below |

The authoritative list is **Settings > Actions > View Actions**, which shows each action's description, parameters, dependencies and whether it is a standard (verified) or custom one.

## Actions that can cut you off

Some actions can sever Kookaburrow's own connection to the host. They refuse to run without the information that keeps you connected:

| Action | Parameters | Safeguard |
|---|---|---|
| **Host - Isolate** (Windows) | `AllowedAddresses`, optional `AutoReleaseMinutes`, optional `AllowDomainControllers` | Turns the firewall on for all profiles, blocks everything inbound and outbound except `AllowedAddresses` (comma separated IPv4 addresses or CIDR ranges). The list **must include the Kookaburrow server** or you lose contact. `AutoReleaseMinutes` lifts the isolation on the host after that time |
| **Host - Isolate** (Linux) | `ALLOWED_ADDRESSES`, optional `AUTO_RELEASE_MINUTES` | Saves the current iptables rules, then allows only loopback and the listed addresses in both directions. Needs iptables |
| **Network - Disable Adapter** | `AdapterName` | Disabling the adapter the host is managed over ends your contact. Use Host - Isolate to keep access from your server |
| **SSH - Disable Password Login** (Linux) | `CONFIRM` | Set `CONFIRM` to `YES` only when key login is known to work. If the account Kookaburrow uses logs in with a password, you will lose contact. Undo with SSH - Remove Overrides |

The [Quarantine](03-hosts.md#quarantine) button on Health > Monitor uses Host - Isolate and works out the right allowed address for you.

## Deploy actions

For rolling out monitoring agents. They share these behaviours:

- The installer is a [dependency](09-library.md#dependencies): upload it under Settings > Upload Binaries first. It is staged in a temporary folder on the host and removed afterwards.
- They check for administrator rights (Windows) or root (Linux), skip the install if the service already exists, and verify the service is running afterwards.

| Action | Installer(s) to upload | Parameters |
|---|---|---|
| Deploy - Velociraptor (Windows) | `velociraptor-client.msi` (your repackaged client MSI) | none |
| Deploy - Velociraptor (Linux, Debian/Ubuntu) | `velociraptor-client.deb` | none |
| Deploy - Sysmon (Windows) | `Sysmon64.exe`, `sysmon-config.xml` | none |
| Deploy - Sysmon (Linux, Debian/Ubuntu) | `sysinternalsebpf.deb`, `sysmonforlinux.deb`, `sysmon-linux-config.xml` | none |
| Deploy - Elastic Agent (Windows) | `elastic-agent-windows.zip` (official windows-x86_64 zip) | `FleetUrl`, `EnrollmentToken`, optional `Insecure` |
| Deploy - Elastic Agent (Linux) | `elastic-agent-linux.tar.gz` (official linux-x86_64 tarball) | `FLEET_URL`, `ENROLLMENT_TOKEN`, optional `INSECURE` |

The Elastic enrolment token is used for that run only, is never stored by Kookaburrow and is hidden in the output.

## Cancelling a response

**Cancel** on a running response shows a stronger warning than for hunts, and the server asks for the confirmation as well:

- Actions change hosts. The one in progress is **cut off part-way** and may be partly applied, or may still finish on the host.
- Actions not yet started are skipped.
- Afterwards, check the affected hosts. The response log shows which action was cut off.

## Following a response

**Burrow! > Respond** lists **Previous responses** with the same *Progress by host* table as hunts. Output for each action is saved as a CSV (what the action printed, one row per line, with a `Stream` column of `stdout` or `stderr`) in `output/responses/R_<name>_<date>/`, with an [activity log](06-results.md#activity-log). Responses can be [reported on](06-results.md#report) the same way as hunts.

## Recurring responses

Turn on **Recurring response** on the Overview step to repeat a response, for example re-applying a hardening action. Parameter values are kept encrypted so it can run unattended. See [Recurring](07-workflows-and-recurring.md).

## Good practice

- Test an action on one non-critical host before a group.
- Read the action's description and parameters in View Actions before running it.
- Prefer reversible actions and keep the matching undo (Release, Unblock, Restore Quarantined) in mind.
- Use roles to limit who has `actions.run` ([Users and roles](08-settings.md#users-and-roles)). The built-in *user* role cannot run actions.
- Every response is recorded with who ran it and when, in the activity log.
