<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [Installation](01-installation.md) · Next: [Hosts](03-hosts.md)

# 2. Getting started

A walk from first sign-in to your first report, about 15 minutes.

- [Sign in](#sign-in)
- [The interface](#the-interface)
- [Step 1: add a host](#step-1-add-a-host)
- [Step 2: run a hunt](#step-2-run-a-hunt)
- [Step 3: read the results](#step-3-read-the-results)
- [Step 4: try a response](#step-4-try-a-response)
- [Where to go next](#where-to-go-next)

## Sign in

Open the address you chose at install (default <http://127.0.0.1:46200>) and sign in with the admin account. After five wrong passwords for a user name, sign-in for that name is paused for 30 seconds. A session ends after 8 hours without use.

If the server uses HTTPS (see [Certificate](08-settings.md#certificate)) your browser shows a warning until the Kookaburrow CA is trusted on your machine.

## The interface

Click the logo for **Home**: the server's name, listening address, version, WinRM engine, uptime and disk use, the library counts, and what your account is allowed to do. **Documentation** opens these guides inside Kookaburrow with search, so they work offline (**View on GitHub** in the viewer opens the online copy).

The top bar holds the main areas. Anything your role cannot use is greyed out.

| Tab | What it is for |
|---|---|
| **Settings** | System settings (users, shell, health, run, server, certificate), the collection and action libraries, and External (Binaries, Dependencies, Elastic and Single Sign-On) |
| **Host Management** | View Hosts, Profiles, Groups, Discover (scan), Manually Add |
| **Burrow!** | Hunt, Respond, Workflow, Recurring |
| **Results** | Activity log, JSON, and Analysis: Report, Diff, Cross-host comparison, IOC, Baseline |
| **Browse** | A file browser over collections, actions, binaries, output and reports, and your Pinned items |
| **Shell** (right) | Interactive shells on authenticated hosts |
| **Health** (right) | Monitor, Monitor log, Quarantine log |

Next to the Shell and Health buttons the bar shows how many hosts answer ping (*hosts*) and how many answer their remote-management port (*remote*), for example `hosts 5/6  remote 6/6`.

## Step 1: add a host

The quickest route is **Host Management > Manually Add**:

1. Choose **WinRM (Windows)** or **SSH (Linux)**.
2. Enter the IP address or host name, a user name and a password. For a domain account, add the domain.
3. Press **Authenticate and add**. The host is saved only if the login works. Its name and operating system are read from the host itself.

The host now appears in **Host Management > View Hosts**. For scanning a subnet, credential profiles and groups see [Hosts](03-hosts.md). Host requirements (WinRM enabled, reachable ports, administrator rights) are listed there too.

## Step 2: run a hunt

1. Go to **Burrow! > Hunt** and press **New Hunt**.
2. **Who**: tick the host (or a group).
3. **Collections**: choose a collection list (PowerShell for Windows hosts, Linux for SSH hosts) and tick a few, for example `System - Info` and `Network - Connections`.
4. **Parameters**: only shown if a chosen collection takes some.
5. **Automation**: optional. A workflow to run afterwards, whether to send results to Elastic, and whether the hunt repeats. Leave it as it is for now.
6. **Overview**: name the hunt, check the summary and press **Run Hunt**.

The hunt appears in **Previous hunts** with a live status per host. Select it for details, errors and downloads. More in [Hunts](04-hunts.md).

## Step 3: read the results

- **Burrow! > Hunt**, then select the hunt: the files it produced, per host.
- **Results > Activity**: the time-stamped chain of custody for the hunt, with hashes.
- **Results > Report > Generate report**: one searchable HTML page for the whole hunt.
- **Browse > Files**: the output folder, with search, preview and download.

Everything is also on disk, see [Output layout](04-hunts.md#output-layout).

## Step 4: try a response

Responses change hosts, so start with something reversible on a test machine:

1. **Burrow! > Respond > New Response**.
2. Choose the host, an action such as `Processes - Suspend`, fill in its parameters and run it.
3. Confirm the prompt. The result is in **Previous responses**.

Read [Responses](05-responses.md) before using actions on production hosts, especially the ones that can cut you off.

## Where to go next

- Collect from many hosts and keep it running: [Hunts](04-hunts.md), [Recurring](07-workflows-and-recurring.md).
- Give colleagues their own accounts with limited permissions: [Settings > User Management](08-settings.md#users-and-roles).
- Send everything to Elastic: [Elastic](10-elastic.md).
- Turn on HTTPS and restrict who can connect: [Settings](08-settings.md) and [Security](11-security.md).
