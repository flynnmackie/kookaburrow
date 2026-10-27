<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Workflows and recurring runs](07-workflows-and-recurring.md) · Next: [The library](09-library.md)

# 8. Settings

**Settings** holds the system configuration, the libraries and the binaries. Viewing a settings page needs `system.view` (or the matching view permission); changing it needs `system.manage` (or the matching manage permission). A control you may not use is greyed out and explains what permission it needs.

- [Users and roles](#users-and-roles)
- [Shell Settings](#shell-settings)
- [Health Settings](#health-settings)
- [Run Settings](#run-settings)
- [Server Settings](#server-settings)
- [Certificate](#certificate)
- [Elastic](#elastic)
- [Collections and Actions](#collections-and-actions)
- [Dependencies](#dependencies)
- [Binaries](#binaries)
- [Permission reference](#permission-reference)

## Users and roles

**Settings > System > User Management** has two tabs, **Users** and **Roles**.

### Users

- **New user**: a user name (2 to 32 letters, digits, dots, dashes or underscores, unique ignoring case), a password of at least 8 characters, and one or more roles. Needs `users.manage`.
- Every user belongs to at least one role. Roles are assigned with `roles.manage`.
- **Passwords**: you change your own from your user (*Change my password*, current password required). Changing someone else's password needs `users.manage`, and you cannot change the password of a user who has more access than you. Changing a password signs that user out everywhere else.
- **Deleting**: you cannot delete the account you are signed in with, so at least one admin always remains. Only admins can delete admins.
- An admin's roles cannot be changed here.

### Roles

A role is a set of permissions. The built-in **admin** role holds everything, including permissions added in future, and cannot be edited or deleted. Two roles are supplied once on a new install and can be edited or deleted like any custom role:

| Role | Intended for | Permissions |
|---|---|---|
| **user** | Day-to-day hunting | `hosts.manage`, `hunts.run`, `hunts.export`, `shell.files`, `collections.view`, `actions.view`, `workflows.run`, `system.view`. Cannot run actions or change settings |
| **Privileged User** | Senior analysts | Everything except managing users, roles and system settings: adds `users.view`, `collections.manage`, `actions.manage`, `actions.run`, `workflows.manage` |

Permissions come in ladders: ticking a higher option ticks what it includes (for example *Manage hosts* includes *View hosts*), and unticking a lower one unticks what depends on it. **You cannot grant permissions you do not hold.** The full list is in the [permission reference](#permission-reference).

## Shell Settings

Controls the interactive shells on the Shell tab. Changes apply immediately, and any open shell that is no longer allowed is closed.

| Setting | Default | Range |
|---|---|---|
| Shells enabled | on | on or off |
| Allow shells to | all hosts | *All hosts*, or *only the hosts ticked*. A host added later is not allowed until ticked |
| Maximum open shells | 8 | 1 to 8 |
| Idle timeout (minutes without input) | 20 | 1 to 1440 |

## Health Settings

Controls the [health monitor](03-hosts.md#health-monitor). Changes apply immediately.

| Setting | Default | Range |
|---|---|---|
| Monitoring | on | on or off |
| Ping interval | 60 seconds | 5 to 3600 |
| Remote port interval | 300 seconds | 10 to 86400 |
| Hosts checked | all | per host, ping and remote port separately. A host that is not checked shows *not monitored*. A host added later is checked both ways until you change it |

## Run Settings

How many hosts a hunt or response works on **at the same time**. Each host's collections or actions still run one after another. A change applies to runs started afterwards.

| Setting | Default | Range |
|---|---|---|
| Hosts at once | 4 | 1 to 32 |
| Large file transfers at once (all hunts together) | 2 | 1 to 16 |

Each Windows host in a run starts its own PowerShell session on the server, about **100 MB of memory each** plus a burst of CPU while the session starts. The page shows this server's CPU cores, RAM, free RAM and free disk and warns when a value is too high:

| | Recommended | Caution (likely to slow or run short of memory) |
|---|---|---|
| Hosts at once | the lower of 2 per core and 2 per GB of RAM | the lower of 4 per core and 4 per GB of RAM |
| Examples | 2 cores / 4 GB: 4. 4 / 8: 8. 8 / 16: 16 | double the recommendation |
| Large transfers | 2, or 4 with 8+ cores, 16+ GB and plenty of free disk | transfers are limited by disk and network, and each can be several GB |

Saving a value well above the recommendation asks you to confirm.

## Server Settings

The address and port the server listens on, and which other computers may connect. **Saving restarts the server.** localhost (127.0.0.1 and `::1`) can always connect and is always listened on, whatever is set, so you cannot lock yourself out from the server PC.

| Setting | Meaning |
|---|---|
| Listen address | *This PC only* (127.0.0.1), *All network interfaces* (0.0.0.0), or one IPv4 address of this machine |
| Port | 1 to 65535 |
| Allowed to connect | One per line: an IPv4 address (`10.0.0.5`) or range (`192.168.1.0/24`). Empty means this PC only |

The page checks what you enter before saving. **Errors** block saving (a bad address or port, an address that is not on this machine, a port already in use). **Warnings** ask you to confirm:

- listening on the network over plain HTTP (passwords cross the network unencrypted; turn on HTTPS)
- a privileged port (under 1024)
- listening on the network with no allowed addresses (only this PC could connect)
- allowed addresses while listening on this PC only (they cannot reach it)
- a very wide range (a /7 or wider)
- a range that is not on any network the server is directly connected to
- you are connected from an address that will not be allowed after the restart
- the address you are using this page on will stop working
- Windows Firewall may block the port from other machines

**Fallback:** if the saved settings cannot be used at start-up (the port is taken, the address is gone) the server falls back to localhost and the page says why. Fix the settings and save, or dismiss the notice.

Other computers are also checked against the `Host` and `Origin` headers, which blocks DNS-rebinding attacks.

## Certificate

HTTPS, the same idea as Velociraptor: Kookaburrow makes its **own certificate authority (CA)** and a server certificate signed by it.

1. In **Names and IP addresses**, list what people browse to, one per line (a DNS name and/or an IP address). `localhost`, `127.0.0.1` and `::1` are always included. **Add this machine's addresses** fills them in.
2. Press **Generate certificate**. It creates an ECDSA P-256 CA (valid 10 years) and a server certificate (825 days) with those names as subject alternative names, in `data\tls`. Generating again keeps the CA unless you choose **New CA and certificate**, which requires every machine that trusts the old CA to import the new one.
3. Switch **HTTPS** on. The server restarts. One port then serves both: a connection that starts with a TLS handshake is the HTTPS app; plain HTTP from **other** machines is redirected to HTTPS; plain HTTP from **this PC** is served as it is, so a certificate problem can never lock you out.
4. **Download CA certificate** and import it where you browse from, so the browser stops warning:

   | Where | How |
   |---|---|
   | Windows | `certutil -addstore -f Root kookaburrow-ca.pem` in an administrator prompt (or double-click the renamed `.crt`, Install Certificate, Local Machine, Trusted Root Certification Authorities) |
   | Linux | Copy to `/usr/local/share/ca-certificates/kookaburrow-ca.crt`, then `sudo update-ca-certificates` |
   | macOS | Open in Keychain Access and set to Always Trust |
   | Firefox | Has its own store: Settings, Privacy and Security, Certificates, View Certificates, Authorities, Import |

The page warns when the certificate has expired or expires within 30 days, when it does not name an address you are using, and when HTTPS is on with no certificate. Generating needs the bundled Python engine (it is part of the MSI). The keys in `data\tls` are not encrypted, like `data\secret.key`: protect the data folder.

## Elastic

Forwards hunt rows to Elasticsearch. Fully documented in [Elastic](10-elastic.md).

## Collections and Actions

- **View Collections** and **View Actions** list the library with search (names and script text), tag and type filters, and a **Favourites** filter. Selecting one shows its description, dependencies (with whether each is uploaded), tags, parameters and script, and a tick for *verified* (shipped and unmodified).
- **Add Collections** and **Add Actions** create custom ones: choose PowerShell or Linux, a file name, a name, description, tags, the footprint, what it returns, its type and dependencies, and paste or **upload** the script. Needs `collections.manage` or `actions.manage`.
- Custom ones show as *custom* (not verified). Writing them is covered in [The library](09-library.md#writing-your-own).

## Dependencies

Settings > External > **Dependencies** lists software that must be **installed on the server** (not uploaded) for some [workflow tools](07-workflows-and-recurring.md#writing-a-processor). Kookaburrow only checks; installing needs administrator or root rights.

- The first entry is the **.NET 10 runtime** (or later), needed by Eric Zimmerman's tools. It runs `dotnet --list-runtimes` from the PATH and the usual install folders (`C:\Program Files\dotnet`, `/usr/share/dotnet`, `/usr/lib/dotnet`, `~/.dotnet`) and shows the version and path found. Not found shows the install command for this server's operating system.
- The second entry is **Zeek**, needed by the Zeek workflow. It is Linux only: checked on the PATH and in `/opt/zeek/bin`; on Windows the page says Zeek has no Windows build.
- **Re-check** runs the checks again, for example right after you install something. The check also runs when the server starts. Restart the service if a newly installed program is only on a PATH the service has not seen.
- A tool that needs a missing dependency cannot run: its workflow shows *Cannot run*, a hunt with that workflow is refused before it starts, and its archive on **Binaries** is marked *needs … on the server*.
- Needs `system.view`.

## Binaries

Some collections and actions need an external tool. Tools are **not shipped**: upload each one here. A run stages the file in a temporary folder on the target, uses it, and deletes the folder.

- Settings > **External** holds two pages: **Binaries** (this one) and [Dependencies](#dependencies).
- **All / Hunts / Actions / Processing** switch between every binary, those used by collections (staged on a target for a hunt), those used by actions such as the deploy installers (staged for a response), and those used by workflow processors (run on the server); each shows how many it holds. A second filter shows **All**, **Uploaded** or **Not uploaded** binaries, and **Search** matches file names and the names of what uses them.
- The table lists every binary any collection, action or [workflow processor](07-workflows-and-recurring.md#processors) declares (for example `hayabusa.zip`, which is unpacked on the server rather than staged on a target): *Binary*, *Used by*, *File* (uploaded or not, size, hash). A collection that needs a missing binary is greyed out in the hunt dialog.
- Only names a collection or action asks for can be uploaded, so the folder cannot be filled with arbitrary files. The limit is 500 MB per file.
- **Upload from server** imports instead of uploading from your own computer. Point the server at a folder, an SMB share, Nextcloud/WebDAV (a folder address, a WebDAV address or a public share link) or an SFTP server. It searches below that location for the wanted file names (exact name, any case; the newest copy first), and you import the ones you want, optionally checking each against an expected SHA-256. A binary already uploaded is only replaced if you tick **Overwrite**. Nothing about the location is saved, and the server will not connect to its own machine or link-local addresses. SMB from a Linux server needs `smbclient` and is untested.
- Needs `collections.manage`.

The standard set: Sysinternals `sigcheck64.exe`, `handle64.exe`, `listdlls64.exe`, `accesschk64.exe`, `procdump64.exe`, `autorunsc.exe`; `winpmem.exe`; `yara64.exe` (with your rules as `kb-rules.yar`); NirSoft `BrowsingHistoryView.exe`; `kape.zip` and `uac.tar.gz`; and the deploy installers listed in [Responses](05-responses.md#deploy-actions).

## Permission reference

Generated from `src/permissions.js`.

| Area | Permission | Allows | Includes |
|---|---|---|---|
| Users and roles | `users.view` | See the users, their roles and what each role allows. | - |
| Users and roles | `users.manage` | Create, edit and delete users and reset their passwords. | `users.view` |
| Users and roles | `roles.manage` | Create roles, change what a role allows and assign roles to users. | `users.manage` |
| Hosts | `hosts.view` | See the saved hosts, groups and credential profiles. | - |
| Hosts | `hosts.manage` | Run discovery scans, authenticate and add hosts, edit profiles and groups, and delete hosts. | `hosts.view` |
| Collections | `collections.view` | See the collection library and the binaries they depend on. | - |
| Collections | `collections.manage` | Create, edit and delete collections, and upload or remove binaries. | `collections.view` |
| Actions (Respond) | `actions.view` | See the action library. | - |
| Actions (Respond) | `actions.manage` | Create, edit and delete actions. | `actions.view` |
| Actions (Respond) | `actions.run` | Run actions on hosts. These change the hosts they run on. | `actions.view` |
| Hunts and results | `hunts.view` | See hunts, the activity log, collected data, reports and the output files. | - |
| Hunts and results | `hunts.run` | Create and run hunts on hosts and delete hunt records. | `hunts.view` |
| Hunts and results | `hunts.export` | Export logs and collected data and download output files. | `hunts.view` |
| Workflows | `workflows.view` | See the saved workflows and their results. | - |
| Workflows | `workflows.manage` | Create, edit and delete workflows. | `workflows.view` |
| Workflows | `workflows.run` | Run a workflow on hosts. | `workflows.view` |
| Shell | `shell.open` | Open an interactive shell on a host and run commands in it. | - |
| Shell | `shell.files` | Send files to hosts and pull files from them through a shell. | `shell.open` |
| System | `system.view` | See server information and the health monitor, and run health checks. | - |
| System | `system.manage` | Change system settings. | `system.view` |
