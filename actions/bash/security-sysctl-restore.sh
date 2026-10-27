NAME='Security - Remove Kernel Hardening'
DESCRIPTION='Removes the settings file created by Security - Apply Kernel Hardening and reloads the system defaults.'
DEPENDENCIES=()
TAGS=(recovery kernel)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
f=/etc/sysctl.d/99-kookaburrow-hardening.conf
$SUDO test -f "$f" || { echo "No Kookaburrow hardening file present"; exit 0; }
$SUDO rm -f "$f" && echo "Removed $f"
$SUDO sysctl --system >/dev/null 2>&1 && echo "System sysctl configuration reloaded"
exit 0
