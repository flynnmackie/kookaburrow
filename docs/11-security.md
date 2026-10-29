<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Elastic](10-elastic.md) · Next: [Architecture](12-architecture.md)

# 11. Security

What protects Kookaburrow, what it can do to other machines, and where its limits are. Read this before exposing it beyond one PC.

- [The threat model in one paragraph](#the-threat-model-in-one-paragraph)
- [Authentication](#authentication)
- [Authorisation](#authorisation)
- [Network exposure](#network-exposure)
- [Credentials](#credentials)
- [What runs with which privileges](#what-runs-with-which-privileges)
- [Evidence integrity](#evidence-integrity)
- [Hardening checklist](#hardening-checklist)
- [Known limits](#known-limits)

## The threat model in one paragraph

Kookaburrow holds administrator credentials for your hosts and can run code on them. Whoever controls it controls those hosts. Protect the server and its data folder like a domain admin workstation: limit who can reach it, use HTTPS, give people the least role they need, and keep the server patched.

## Authentication

- **Sign-in** with a user name and password. The first administrator is created at install (MSI) or as `admin` / `admin` on a first run from source, which you must change at once.
- **Password storage**: a salted scrypt hash. The password itself is never stored. Minimum length 8.
- **Lockout**: five wrong passwords for a user name pause sign-in for that name for 30 seconds. Checking your *current* password when changing it counts towards the same limit.
- **Sessions**: a random token is sent in an `HttpOnly`, `SameSite=Strict` cookie (also `Secure` over HTTPS). Only its SHA-256 is kept on the server, so a copy of the database cannot be used to sign in. A session ends after 8 hours without use, on sign-out, and when the password changes (your other sessions end; for someone else's password, all of theirs).
- **Single sign-on** through OpenID Connect is available ([Settings](08-settings.md#single-sign-on)): the code flow with PKCE, state and nonce, and the ID token's signature, issuer, audience, expiry and nonce are all checked. Multi-factor authentication is whatever the provider enforces; Kookaburrow has none of its own. A user created by single sign-on gets the **No Access** role and no password. Linking an identity to an existing user by name trusts the provider's choice of names: see the warning there.

## Authorisation

- Every API route needs a permission. A route that has no rule is **refused**, so new routes are locked until described ([permission map](12-architecture.md#permission-map)).
- Permissions are grouped into roles; the built-in `admin` role holds everything. A user can only grant permissions they hold themselves, cannot change the password of someone with more access, and cannot delete their own account (so an admin always remains).
- The interface greys out what a role cannot do, but the server enforces it.
- Use the least role: the built-in *user* role can hunt and open file shells but cannot run actions or change settings.

## Network exposure

| Control | Detail |
|---|---|
| Listen address | Default `127.0.0.1` (this PC only). Set in Server Settings or at install |
| Client allow-list | Addresses or ranges that may connect besides this PC. Others get `403`. Checked on every request |
| localhost | Always allowed and always listened on, so settings can never lock you out from the server PC |
| `Host` / `Origin` checks | Requests whose `Host` or `Origin` is not one of the server's own names are rejected. This blocks DNS rebinding and cross-site requests |
| HTTPS | Optional, with a built-in CA ([Certificate](08-settings.md#certificate)). When on, plain HTTP from other machines is redirected to HTTPS. **Plain HTTP stays available from this PC itself**, by design |
| Firewall | The server keeps one Windows Firewall rule for its port, open only to the allowed computers, while it listens on the network; with no allowed computers or on localhost there is no rule |

Server Settings warns when you expose the server over plain HTTP, listen on the network without an allow-list, use a very wide range, or would lock out your own browser.

**Recommendation:** if anyone other than you uses it, turn on HTTPS, set an allow-list of the analysts' addresses, and keep it on a management network.

## Credentials

- Saved host passwords (and sudo passwords), recurring-run parameter values and the Elastic API key or password are encrypted at rest with **AES-256-GCM**. The key is `data/secret.key`, created on first start.
- **The key sits next to the data** in a plain file, and the TLS keys in `data/tls` are not encrypted either. Protect the folder: the MSI restricts `C:\ProgramData\Kookaburrow` to SYSTEM and Administrators. Anyone who can read both `db.json` and `secret.key` can recover the saved credentials. (Moving the key to Windows DPAPI is a known to-do.)
- Passwords are never sent back to the browser, and never appear in logs, the activity log or error messages.
- **Hunt and response parameter values are not stored**, except in recurring schedules, where they are kept encrypted.
- WinRM and SSH credentials are passed to the engine by **environment variable**, not on a command line.
- The location and sign-in details used for a one-off [binary import](08-settings.md#binaries) (SMB, SFTP, Nextcloud, WebDAV) are not saved.

## What runs with which privileges

| Where | Runs as |
|---|---|
| The Kookaburrow service on the server | **LocalSystem** (MSI install). The server, the WinRM engine and all SMB/SFTP pulls run as this account |
| Collections and actions on a target | The saved credentials' account, normally an administrator or root |
| Deploy and tool staging on a target | A temporary folder, removed afterwards |
| Large pulls from Windows hosts | The host's Server service and SMB firewall rule are turned on for the hunt and restored; the pull uses the host's saved credentials |

Implications:
- Only run scripts you have reviewed. **Custom** collections and actions are marked as such; only add them if you trust the author. Shipped ones are hash-verified ([Verified and custom](09-library.md#verified-and-custom)).
- A compromise of the Kookaburrow web application is a compromise of the server (LocalSystem) and of every host it manages. Treat access to it accordingly.
- Server-side post-processing in workflows, once implemented, will run tools on the server; it is designed around verified library items and no free-text command lines for that reason.

## Evidence integrity

- Every step of a hunt is written to an activity log with a UTC timestamp, and the log is also appended to a CSV in the output folder as it happens.
- Files received are hashed (SHA-256); for large transfers the hash on the host is compared with the hash on the server and the match is recorded.
- Reports escape everything that came from a host before it goes into the page.
- The audit trail never contains credentials or collected output.

## Hardening checklist

1. Change or remove the default `admin` / `admin` account if you ran from source.
2. Turn on HTTPS and import the CA on analyst machines.
3. Set an explicit allow-list; avoid `0.0.0.0` with an empty list.
4. Give each person their own account and the least role; keep the admin role small.
5. Keep `C:\ProgramData\Kookaburrow` readable only by administrators and back it up as sensitive data.
6. Use dedicated, least-privilege credential profiles for hosts where possible, and rotate them.
7. Review custom collections and actions before use.
8. Keep the server patched; reinstall newer MSIs when released.
9. Restrict who can reach the server's SMB/WinRM/SSH egress and the Elastic endpoint.

## Known limits

- No multi-factor authentication, single sign-on or per-user audit of reads (the activity log records hunts and responses, not page views).
- The encryption key is a plain file (not DPAPI), and TLS private keys are unencrypted.
- **SSH host keys are not pinned**: a connection accepts whatever key the host presents.
- WinRM uses HTTP 5985 with NTLM message encryption by default; Kerberos and HTTPS WinRM are supported by the engine but less tested.
- The data store is a JSON file loaded in memory; it is not designed for very large inventories or heavy concurrent writes.
- Sends to Elastic are not persistent across a restart, and `run_by` is a filter rather than access control.
- Not tested yet: the Linux server paths (including SMB from Linux), and HTTPS from a separate machine with a trusted CA in a real browser.
