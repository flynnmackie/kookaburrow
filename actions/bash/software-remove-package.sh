NAME='Software - Remove Package'
DESCRIPTION='Removes an installed package with the host package manager (apt, dnf, yum or zypper), non-interactively. PACKAGE_NAME is the exact package name shown by Packages - Installed. Use it to remove unwanted remote access tools, network scanners or packages an attacker installed. Refuses to remove anything that would also remove essential system packages (the package manager decides).'
DEPENDENCIES=()
PARAMETERS=(PACKAGE_NAME)
TAGS=(software remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$PACKAGE_NAME" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9+._:-]*$' || { echo "PACKAGE_NAME must be a package name" >&2; exit 2; }
if command -v apt-get >/dev/null 2>&1; then
  dpkg -s "$PACKAGE_NAME" >/dev/null 2>&1 || { echo "Package not installed: $PACKAGE_NAME" >&2; exit 1; }
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get remove -y "$PACKAGE_NAME" 2>&1 | tail -n 15
elif command -v dnf >/dev/null 2>&1; then $SUDO dnf remove -y "$PACKAGE_NAME" 2>&1 | tail -n 15
elif command -v yum >/dev/null 2>&1; then $SUDO yum remove -y "$PACKAGE_NAME" 2>&1 | tail -n 15
elif command -v zypper >/dev/null 2>&1; then $SUDO zypper --non-interactive remove "$PACKAGE_NAME" 2>&1 | tail -n 15
else echo "No supported package manager found" >&2; exit 1; fi
exit 0
