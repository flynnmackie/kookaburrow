<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Getting started](02-getting-started.md) · Next: [Hunts](04-hunts.md)

# 3. Hosts

- [How hosts are connected](#how-hosts-are-connected)
- [Preparing targets](#preparing-targets)
- [Discover: scanning a network](#discover-scanning-a-network)
- [Credential profiles](#credential-profiles)
- [Manually Add](#manually-add)
- [View Hosts](#view-hosts)
- [Groups](#groups)
- [Health monitor](#health-monitor)
- [Quarantine](#quarantine)
- [Shell](#shell)

## How hosts are connected

| Target | Protocol | Port | Runs |
|---|---|---|---|
| Windows | WinRM (NTLM, message encryption) | 5985 (HTTP) or 5986 (HTTPS) | PowerShell collections and actions |
| Linux | SSH | 22 (or your port) | bash collections and actions |

A host is only saved after a login succeeds, so the host list is always made of verified hosts. The saved credentials are encrypted ([Security](11-security.md#credentials)).

Windows uses the bundled WinRM engine (pypsrp), which speaks the protocol itself: nothing needs configuring on the server (no TrustedHosts or AllowUnencrypted changes). Home shows which engine is in use.

## Preparing targets

**Windows**
- WinRM enabled and reachable: `Enable-PSRemoting -Force` (or Group Policy) and TCP 5985 open from the Kookaburrow server.
- An account that is a local or domain administrator. Most collections need it; the description of each says so.
- A *local* (non-domain) account used over the network also needs `LocalAccountTokenFilterPolicy = 1`:
  ```powershell
  New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System `
    -Name LocalAccountTokenFilterPolicy -Value 1 -PropertyType DWord -Force
  ```
- For HTTPS WinRM, a listener on 5986. Tick **Use HTTPS** when adding the host.
- For large file pulls: the account must be able to reach `C$` (administrator), and the server must reach TCP 445. Kookaburrow turns SMB on for the hunt and off again, see [large file transfers](04-hunts.md#large-file-transfers).
- Active Directory hunts (`AD - ...`) must be run against a domain controller.

**Linux**
- `sshd` running with password authentication for the account you use.
- bash. Collections marked *Needs root or passwordless sudo* use `sudo -n`, so the account must be root or have passwordless sudo for them to read protected files.
- For large file pulls, the SFTP subsystem (on by default) is used over the same SSH connection; nothing is opened.

## Discover: scanning a network

**Host Management > Discover** finds candidates; it does not save anything by itself.

1. Enter a **target** and press **Scan**. A target is one or more comma-separated parts:

   | Form | Example |
   |---|---|
   | Subnet | `192.168.50.0/24` (network and broadcast addresses are skipped) |
   | Last-octet range | `192.168.50.10-20` |
   | Full range | `192.168.50.10-192.168.51.5` |
   | Single address | `192.168.50.7` |
   | Shorthand | `192.168.50.5,6,7` or `192.168.50.5,10-20` (a bare number reuses the previous address's first three octets) |

   A scan covers at most 4096 addresses (a /20).
2. The scanner probes TCP 22, 135, 445, 3389, 5985 and 5986, then does a reverse DNS lookup and guesses the OS from the open ports. A silent address does not mean a host is down (a busy host, a firewall that drops packets, a lost packet), so it works in steps, each slower than the last:
   - **Step 1:** every address and port once, waiting 2 seconds.
   - **Step 2:** hosts that showed a sign of life (a reset, or an entry in this server's ARP/neighbour table for hosts on the same network) and hosts where only some ports answered: the silent ports are tried twice more, waiting 5 seconds.
   - **Step 3:** every address that is still silent gets 5985, 445 and 22 once more, waiting 3.5 seconds. A host found this way has its other ports checked properly.
   - The status line shows *re-checking addresses that did not answer* during steps 2 and 3. A large range therefore takes several times longer than before (a /24 takes about a minute, a /20 several minutes when most addresses are empty).
   - Hosts that are up on the network but had none of those ports open (a firewall may be blocking them) are counted in the status line with their addresses, so a missing host can be told apart from a host that is not there.
3. For hosts that answer, it checks the protocol for real instead of trusting the port: an unauthenticated POST to `/wsman` (a real WinRM service answers 401 and offers Negotiate) and the SSH banner (`SSH-2.0-...`). No credentials are sent. Each is tried twice.
4. **Discovered hosts** lists Host, Hostname, OS (assumed), Open ports, Profile and Remote protocol. Pick a [profile](#credential-profiles) for a host and press **Authenticate**. On success the host is saved with its real hostname and OS.
5. **Cancel** stops a scan, **Clear scan** empties the result list, and **Clear all** removes the discovered hosts.

## Credential profiles

**Host Management > Profiles** holds reusable logins so you do not retype passwords for every host.

| Field | Notes |
|---|---|
| Type | **Windows (domain)**, **Windows (standalone)** or **Linux (SSH)** |
| Name | Unique, case-insensitive. Adding a profile with an existing name updates it |
| User name | Required |
| Domain | Domain type only |
| Password | Required for a new profile. Left blank on update it keeps the stored one |
| Sudo password | Linux type only. It is stored encrypted, but the shipped collections use passwordless sudo and do not use it yet |

Passwords are never sent back to the browser. The profile list shows only that a password is set.

## Manually Add

**Host Management > Manually Add** authenticates and adds one host without a scan.

| Field | Notes |
|---|---|
| Connect with | **WinRM (Windows)** or **SSH (Linux)** |
| IP address or host name | Required |
| Name | Optional; defaults to the host's own name |
| Domain | Optional |
| User name, Password | The login to test |
| Port | Optional; defaults to 5985 (WinRM), 5986 (WinRM with HTTPS) or 22 (SSH) |
| Use HTTPS | WinRM over TLS |

**Authenticate and add** tests the login and saves the host only if it works. The login is shown as *Manual entry* in the Profile column.

## View Hosts

**Host Management > View Hosts** lists saved hosts: a health dot, number, Name, Address, OS, Protocol, Profile, Last verified and Groups. The search box filters by name, address, OS or protocol.

- **Rename** a host with the pencil next to its name (leave it empty to go back to the host's own name).
- **Details** opens the host's history:
  - its details and the groups it belongs to
  - every hunt and response that ran on it, with status and row counts
  - its quarantine state and history
  - recent health checks
- **Delete** removes the host. Results already collected from it are kept.
- The Groups column has a button to change which groups the host is in.

## Groups

**Host Management > Groups** lets you collect hosts into named lists, for example *Domain controllers* or *Web servers*. Create a group, then add hosts to it. A group can be chosen in the **Who** step of a hunt or response, and in recurring runs: when a group is used, the hosts in it at run time are the ones targeted. A host can be in several groups.

## Health monitor

The server pings every saved host and checks its remote-management port, so the host list always says what is reachable. It runs inside the server and keeps checking when no page is open.

| Check | Default interval | What it tests |
|---|---|---|
| Ping | 60 seconds | ICMP reply |
| Remote | 5 minutes | WinRM port (5985 or 5986) for Windows hosts, SSH (22) for Linux hosts |

- **Health > Monitor** shows each host as up (green), not responding (red) or not monitored (dashed), with a **check now** action.
- **Health > Monitor log** lists every check, newest first (latest 1000 shown): the command, host, time and result. It is written to `data/monitor-log.jsonl` and trimmed at 20 MB (the previous file is kept as `.1`), so it survives restarts.
- After a restart hosts show *unknown* until the first check.
- Interval, on/off and which hosts are checked (ping and remote separately) are set in [Health Settings](08-settings.md#health-settings).

## Quarantine

From **Health > Monitor** you can network-isolate a host, optionally for a set number of minutes, and release it later.

- Isolation is the [Host - Isolate action](05-responses.md#actions-that-can-cut-you-off): firewall rules on Windows, iptables on Linux. Release is Host - Release.
- The host keeps talking to this server: the address the host sees the server on is worked out first and allowed through.
- A timed quarantine ends by itself on the host; the record is dropped when its time has passed and the log says so.
- Each step also appears under **Burrow! > Respond**, and is written to **Health > Quarantine log** (who, when, result).
- Using it needs `actions.run`.

## Shell

**Shell** opens interactive sessions on authenticated hosts, one per host.

- **SSH hosts** get a real terminal. **WinRM hosts** get a line-by-line PowerShell session (no full-screen programs).
- **Send file** and **Pull file** move files through the same session. Pulled files go to `output/Pulled-Files/`.
- From a shell you can start a **quick hunt** or **quick response** on that one host.
- Sessions close after 20 minutes without input by default. [Shell Settings](08-settings.md#shell-settings) can turn shells off, limit them to chosen hosts, cap open sessions (8 at most) and change the idle timeout.
- Needs `shell.open`; the file buttons need `shell.files`.
