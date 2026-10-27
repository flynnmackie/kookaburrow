<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Next: [Getting started](02-getting-started.md)

# 1. Installation

- [Requirements](#requirements)
- [Installing with the MSI](#installing-with-the-msi)
- [Silent installation](#silent-installation)
- [What gets installed](#what-gets-installed)
- [Managing the service](#managing-the-service)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)
- [Signing and trust](#signing-and-trust)
- [Running from source](#running-from-source)
- [Building the installer](#building-the-installer)

## Requirements

| | |
|---|---|
| Server OS | 64-bit Windows 10 or Windows Server 2016 or later (the MSI checks this) |
| Privileges | An administrator to install |
| Network (server to targets) | TCP 5985 (WinRM) or 5986 (WinRM over HTTPS), 22 (SSH), and 445 (SMB) for large file pulls from Windows hosts |
| Network (users to server) | The port you choose, 46200 by default |
| Disk | Enough for what you collect. Raw artefacts (event logs, memory) can be several GB per host; results live under the data folder |
| Internet | Not needed. The MSI carries Node.js, the app and the WinRM engine |

Sizing for concurrent hunts is covered in [Settings > Run Settings](08-settings.md#run-settings).

## Installing with the MSI

Run `Kookaburrow-<version>-x64.msi`. Windows asks for administrator approval.

1. **Welcome.**
2. **Setup type.** Choose one:
   - **Quickstart.** The server listens on `127.0.0.1:46200`, so only this PC can open it. You only create the admin account. Nothing is opened in the firewall.
   - **Custom.** You choose the listening address, the port and which other computers may connect, then create the admin account.
3. **Network** (Custom only):

   | Field | Meaning |
   |---|---|
   | Listening address | `0.0.0.0` listens on every network interface, `127.0.0.1` is this PC only, or an address of this PC. The page lists this PC's addresses. An address that is not on this PC is refused. |
   | Port | 1 to 65535, default 46200. |
   | Computers allowed to connect | IPv4 addresses or ranges, comma separated, for example `10.0.0.5, 192.168.50.0/24`. Empty means this PC only. This PC can always connect whatever is listed. |

   Windows Firewall gets an inbound rule for the port when the address is not `127.0.0.1`.
4. **Administrator account.** User name (letters, digits and `. _ @ -`, up to 64 characters) and a password of at least 8 characters that does not contain a double quote. The password is stored only as a salted hash.
5. **Ready to install**, then install.
6. **Finish.** Tick *Open Kookaburrow in the browser* to open the sign-in page.

Every page checks what you typed before moving on and tells you what to fix.

If an earlier installation left its data behind, the wizard skips the setup-type, network and account pages and keeps the existing users and settings.

## Silent installation

All wizard choices are MSI properties:

| Property | Default | Meaning |
|---|---|---|
| `SETUPMODE` | `quick` | `quick` (this PC only, port 46200) or `custom` |
| `LISTENIP` | `0.0.0.0` | Listening address (custom only) |
| `PORT` | `46200` | Port (custom only) |
| `ALLOWFROM` | empty | Allowed client addresses or ranges (custom only) |
| `ADMINLOGIN` | `admin` | Admin user name |
| `ADMINPASS` | none | Admin password. **Required** for a new install with no existing data |

```powershell
# Quickstart
msiexec /i Kookaburrow-1.0.0-x64.msi /qn ADMINLOGIN=admin ADMINPASS=ChangeMe-12345

# Custom
msiexec /i Kookaburrow-1.0.0-x64.msi /qn SETUPMODE=custom LISTENIP=0.0.0.0 PORT=46200 `
  ALLOWFROM=10.0.0.0/24 ADMINLOGIN=admin ADMINPASS=ChangeMe-12345

# With a log
msiexec /i Kookaburrow-1.0.0-x64.msi /qn /l*v install.log ADMINPASS=ChangeMe-12345
```

Invalid values fail the install with the same message the wizard would show. The password is hidden in the install log.

## What gets installed

| Item | Location |
|---|---|
| Program files, Node.js, WinRM engine | `C:\Program Files\Kookaburrow` |
| Service | `Kookaburrow`, automatic start, runs as LocalSystem |
| Data folder | `C:\ProgramData\Kookaburrow` (only SYSTEM and Administrators can read it) |
| Database and keys | `C:\ProgramData\Kookaburrow\data\db.json`, `secret.key`, `tls\` |
| Server log | `C:\ProgramData\Kookaburrow\data\server.log` |
| Hunt and response results | `C:\ProgramData\Kookaburrow\output\` |
| Uploaded tools | `C:\ProgramData\Kookaburrow\binaries\` |
| Start menu | A *Kookaburrow* shortcut that opens the web interface |
| Firewall | An inbound TCP rule for the chosen port (when not localhost only) |
| Apps list | An entry with the Kookaburrow icon |

Shipped collections and actions live in the program folder (`collections\`, `actions\`). Custom ones you add are saved next to them.

## Managing the service

```powershell
Get-Service Kookaburrow          # status
Restart-Service Kookaburrow      # restart
Stop-Service Kookaburrow
Start-Service Kookaburrow
Get-Content C:\ProgramData\Kookaburrow\data\server.log -Tail 50
```

- Changing the address or port in **Settings > System > Server Settings** restarts the server. Under the service, the wrapper starts the new copy by itself.
- If the server exits unexpectedly the service restarts it (after 10 seconds if it keeps dying immediately).
- The firewall rule is created at install time for the port you chose. If you change the port later, add a rule for it yourself.

## Upgrading

Run the newer MSI over the old one. It replaces the program files and keeps `C:\ProgramData\Kookaburrow` (users, hosts, settings, results). The service is stopped and started by the installer. A newer version already installed blocks installing an older MSI.

## Uninstalling

Use **Settings > Apps > Installed apps > Kookaburrow > Uninstall**, or:

```powershell
msiexec /x Kookaburrow-1.0.0-x64.msi
```

This removes the program, the service and the firewall rule. **The data folder is kept** so a later install can reuse it. For a complete removal, delete `C:\ProgramData\Kookaburrow` afterwards (this deletes all collected results and saved credentials).

## Signing and trust

An unsigned MSI installs fine, but Windows shows **Unknown publisher** (and SmartScreen may warn on a downloaded file). Signing the MSI with a code-signing certificate fixes that. Windows checks the signature **offline**: it needs the signing certificate to chain to a root the machine trusts, not internet access. A timestamp (added at signing time) keeps the signature valid after the certificate expires.

Sign when building:

| Certificate | How | Trusted where |
|---|---|---|
| **Self-signed** (labs, internal use) | `node scripts/build-msi.js --sign-self` | Only machines that import its public certificate (below) |
| **A certificate file** (.pfx) | `$env:KB_SIGN_PFX_PASSWORD='...'; node scripts/build-msi.js --sign-pfx=C:\keys\cert.pfx` | Wherever the issuing CA is trusted |
| **A certificate in the store or on a token** | `node scripts/build-msi.js --sign-thumbprint=<thumbprint>` | Same |

`scripts/sign-msi.ps1` does the signing and can be run on its own against any .msi.

**Self-signed:** the first run makes a certificate in `build\signing` (the private key stays there; keep it private and out of git) and copies the public `Kookaburrow-signing.cer` next to the MSI. On each machine that should trust the installer, run once as an administrator:

```powershell
Import-Certificate -FilePath .\Kookaburrow-signing.cer -CertStoreLocation Cert:\LocalMachine\Root
Import-Certificate -FilePath .\Kookaburrow-signing.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
```

Then the MSI shows *Verified publisher: Kookaburrow*. This works fully offline. Only import the certificate on machines you control.

**Publicly trusted:** a certificate from a public CA is trusted on every Windows machine without importing anything. Certificate authorities now issue code-signing keys on hardware tokens or cloud services, so a plain .pfx in CI is no longer how new certificates are issued; options include a cloud signing service (such as Azure Artifact Signing) and, for open-source projects, programmes like SignPath Foundation. The GitHub release workflow signs automatically when the repository secrets `SIGNING_PFX_BASE64` and `SIGNING_PFX_PASSWORD` exist.

To check a download: `Get-AuthenticodeSignature .\Kookaburrow-1.0.0-x64.msi` shows the signer and status, and `Get-FileHash .\Kookaburrow-1.0.0-x64.msi` should match the hash in the release notes.

## Running from source

Needs Node.js 20 or later.

```powershell
git clone https://github.com/flynnmackie/kookaburrow.git
cd kookaburrow
npm install          # also builds the bundled WinRM engine (vendor/winrm-runtime)
npm start            # http://127.0.0.1:46200
```

- The first run creates the account `admin` / `admin`. Change that password straight away (Settings > System > User Management, select your user, Change my password).
- `npm run setup-winrm` rebuilds the WinRM engine. On Windows it downloads a private embeddable Python and `pypsrp` (nothing is installed system-wide). On Linux or macOS it creates a virtual environment from the Python 3 already installed (`python3-venv` on Debian/Ubuntu).
- Data is kept in `data/`, results in `output/` and tools in `binaries/` inside the folder.

| Environment variable | Default | Meaning |
|---|---|---|
| `KB_HOST` | `127.0.0.1` | Starting listen address (saved Server Settings override it) |
| `KB_PORT` | `46200` | Starting port (saved Server Settings override it) |
| `KB_HOME` | the program folder | Where `data/`, `output/` and `binaries/` live. The MSI sets it to `C:\ProgramData\Kookaburrow` |
| `KB_SERVICE` | unset | Set by the service wrapper: a restart request makes the process exit instead of respawning itself |

## Building the installer

On Windows, with Node.js:

```powershell
npm install
node scripts/build-msi.js        # writes build\Kookaburrow-<version>-x64.msi
```

The script:

1. Stages the app, production `node_modules`, this Node.js (`runtime\node.exe`) and the WinRM engine.
2. Compiles the service wrapper (`installer\KookaburrowService.cs`) and the installer actions (`installer\KbCustomActions.cs`) with the .NET Framework compiler that ships with Windows.
3. Downloads the WiX Toolset 3 once into `build\tools\wix`, harvests the files and builds the MSI.

Pushing a tag such as `v1.0.0` runs `.github/workflows/release.yml`, which builds the MSI on GitHub and attaches it to a release. The version comes from `package.json`.
