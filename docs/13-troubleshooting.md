<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Architecture](12-architecture.md)

# 13. Troubleshooting

Find the symptom, check the cause, apply the fix.

- [Where to look first](#where-to-look-first)
- [Installing and the service](#installing-and-the-service)
- [Reaching and signing in](#reaching-and-signing-in)
- [Adding hosts and connecting](#adding-hosts-and-connecting)
- [Hunts and responses](#hunts-and-responses)
- [Large file transfers](#large-file-transfers)
- [Health and shell](#health-and-shell)
- [Elastic](#elastic)
- [Collecting information for a bug report](#collecting-information-for-a-bug-report)

## Where to look first

| What | Where |
|---|---|
| Server log | `C:\ProgramData\Kookaburrow\data\server.log` (MSI) or the console / `data/server.log` from source |
| What a hunt did, step by step | **Results > Activity**, or `<name>_Log.csv` in the run folder |
| Why a host check fails | **Health > Monitor log** |
| Which engine is used, address, version | **Home** |
| Service state | `Get-Service Kookaburrow` |

## Installing and the service

| Symptom | Cause and fix |
|---|---|
| The MSI says a newer version is already installed | Uninstall the newer one first, or install the same or a newer MSI |
| The wizard refuses the admin user name or password | User name: letters, digits, `. _ @ -`, up to 64. Password: at least 8 characters, no double quote |
| The wizard says an address is not on this PC | The listening address must be `0.0.0.0`, `127.0.0.1` or an address of this machine; the page lists them |
| Silent install fails right away | `ADMINPASS` is required for a new install with no existing data. Run with `/l*v install.log` and read the error |
| The service does not start | Read `data\server.log`. Usually the port is in use (the server then falls back to `127.0.0.1:46200`, then says so in Server Settings), or `db.json` is damaged |
| The service keeps restarting | Same log: the server exits at start. The wrapper retries every 10 seconds while it dies immediately |
| After uninstall the old data is still there | By design. Delete `C:\ProgramData\Kookaburrow` for a complete removal |
| Windows warns about an unknown publisher | The MSI is not code-signed. Verify its SHA-256 against the release notes before running |

## Reaching and signing in

| Symptom | Cause and fix |
|---|---|
| Another PC says *can't reach this page* | Check in order: (1) the server listens on a network address, not `127.0.0.1` (Server Settings, Home shows it); (2) the other PC's address is in the **allowed list**; (3) Windows Firewall has an inbound rule for the port; (4) the PC really has a route to the server (VPNs and default routes can send the traffic elsewhere); (5) you browse to an address or name the server accepts |
| `403 Forbidden` | Your address is not in the allowed list |
| `Bad Host header` or `Bad Origin` | You are browsing by a name or address that is not one of the server's own. Use an address Server Settings lists, or add the name to the [certificate](08-settings.md#certificate) and browse by it |
| The browser shows a certificate warning | HTTPS is on and the CA is not trusted on this machine. Import the CA, see [Certificate](08-settings.md#certificate). Or browse from the server PC, where plain HTTP always works |
| Sign-in says *too many attempts* | Five wrong passwords pause that user name for 30 seconds |
| You forgot the only admin password | From the server PC, sign in as another admin. If there is none, stop the service and, in the program folder, run the set-up script with the data folder in `KB_HOME`: `$env:KB_HOME='C:ProgramDataKookaburrow'; .untime
ode.exe scriptsinstall-setup.js --host=x127.0.0.1x --port=x46200x --allow=xx --user=xadminx --pass=xNewPassword1x` (each value is wrapped in one extra character on each side). This sets that admin password and resets Server Settings to the values you give; then start the service |
| After saving Server Settings the page does not come back | The new address or port is not reachable from where you are. Browse to `http://127.0.0.1:<port>` on the server PC |
| *Saved settings failed; started on ... instead* | The saved address or port could not be used at start-up. Fix them in Server Settings |

## Adding hosts and connecting

**Windows (WinRM)**

| Symptom | Cause and fix |
|---|---|
| Connection refused or timed out | WinRM not enabled or port 5985 (5986 for HTTPS) blocked. On the target: `Enable-PSRemoting -Force`; open the port from the server |
| Unauthorized / login failed | Wrong user name or password, or the wrong domain. For a domain account fill the domain field |
| A local account fails over the network although the password is right | Set `LocalAccountTokenFilterPolicy = 1` on the target, see [Hosts](03-hosts.md#preparing-targets) |
| Access denied during a collection | The account is not an administrator. Most collections need one |
| Authenticates but the host shows a different OS | The OS is read from the host itself once authenticated. The Discover guess is only from open ports |
| HTTPS WinRM fails | Needs a listener on 5986 and **Use HTTPS** ticked. Certificate trust errors point to the listener's certificate |

**Linux (SSH)**

| Symptom | Cause and fix |
|---|---|
| Authentication failed | Password authentication is disabled in `sshd_config`, or the account is wrong |
| A collection returns nothing useful | It needed root. Use root or an account with passwordless sudo (`sudo -n` must work) |

## Hunts and responses

| Symptom | Cause and fix |
|---|---|
| A collection is greyed out in New Hunt | A binary it depends on is not uploaded. Hover it, then upload under [Upload Binaries](08-settings.md#upload-binaries) |
| A collection shows as an error on one host | Open the hunt: the error is the first line of the failure. Typical: not administrator, wrong collection type for the host (PowerShell on a Linux host or the reverse), or a tool missing |
| PowerShell collection blocked as malicious | Windows AMSI can block a script that mentions attacker tool names. Rephrase patterns in custom scripts |
| `AD - ...` hunts fail with a double-hop error | Run them against a domain controller directly. From a member server over WinRM the double-hop limit stops the query |
| A host sits at *Waiting* | It is queued for a large-transfer slot. Raise *Large file transfers at once* in Run Settings if the server can take it |
| Hunts slow the server down | Lower *Hosts at once* in [Run Settings](08-settings.md#run-settings); each Windows host in a run uses about 100 MB and a burst of CPU |
| A hunt says *Interrupted* | The server restarted while it ran. Run it again; what was collected before is kept |
| Output looks cut off | A collection's output is capped at 5 MB and a warning is in the activity log. Use a large-transfer collection or narrow the query with parameters |
| A recurring hunt did not run while the server was off | Missed runs are not made up; one run happens when the server is back |
| A response was cancelled and the host is in a strange state | Cancelling cuts an action part-way. Check the host; the response log shows which action was cut off |
| Cannot reach a host after an action | Host - Isolate, Network - Disable Adapter or SSH - Disable Password Login cut the connection. Use Host - Release, re-enable the adapter from the console, or remove the SSH override at the host |

## Large file transfers

| Symptom | Cause and fix |
|---|---|
| The pull fails at *SMB* | The server cannot reach TCP 445 on the target, the SMB client is disabled on the server, or the account cannot reach `C$` (needs an administrator; a local account needs `LocalAccountTokenFilterPolicy`) |
| SMB is left on after a failure | The restore step runs at the end of the hunt; if the host was lost mid-run, check the Server service and the *File and Printer Sharing (SMB-In)* rule on it and the activity log |
| Hash mismatch recorded | The file changed while copying (an active log, for example). Collect again, or use a collection that copies from a volume shadow |
| Linux pulls fail | SFTP is off in `sshd_config`, or the account cannot read the files |

## Health and shell

| Symptom | Cause and fix |
|---|---|
| A host is red but works | ICMP is blocked, so the ping check fails. Turn off the ping check for that host (Health Settings) and rely on the remote port check |
| Everything is *unknown* | After a server restart hosts show unknown until the first check, a few seconds |
| The shell closed by itself | Idle timeout (20 minutes by default), or a Shell Settings change no longer allows it |
| A full-screen program does not work in a Windows shell | WinRM shells are line by line (no pty). Use an SSH host for a real terminal |
| *Send file / Pull file* is disabled | You need `shell.files`, and the host's shell must be open |

## Elastic

| Message | Meaning |
|---|---|
| Connection refused | Nothing listens at that address and port; check the Elasticsearch service and the firewall |
| The host name could not be found | DNS cannot resolve the name; use an address |
| Timed out | The server did not answer; check routing and firewall |
| The server's certificate is not trusted | Paste its CA in the CA box, or tick *Skip certificate check*. Browsing by an address the certificate does not list also fails |
| The server did not speak TLS on that port | Use `http://` instead of `https://` for that port |
| Sign-in was refused | The API key or user name and password is wrong |
| The account cannot write to `kookaburrow-*` | The API key or role lacks `create_index`, `index` or `auto_configure` on `<prefix>-*` |
| Rows show as failed | The status line shows the first reason Elasticsearch gave (a mapping or index setting problem, for example) |
| Nothing arrives | Check the switch is **On**, run *Test connection*, then use *Send a past hunt* to confirm the path |

## Collecting information for a bug report

- The Kookaburrow version (Home) and how it was installed.
- The relevant lines of `server.log` and, for a hunt, the activity log CSV.
- The exact message shown, and what the target is (Windows version, Linux distribution).
- Never include passwords, API keys, or `db.json` and `secret.key`.
