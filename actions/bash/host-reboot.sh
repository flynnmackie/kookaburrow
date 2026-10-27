NAME='Host - Reboot'
DESCRIPTION='Reboots the host after DELAY_MINUTES (default 1) with a message to logged-in users.'
DEPENDENCIES=()
PARAMETERS=(DELAY_MINUTES?)
TAGS=(containment recovery host)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
M=${DELAY_MINUTES:-1}; case "$M" in ''|*[!0-9]*) echo "DELAY_MINUTES must be a number" >&2; exit 2;; esac
$SUDO shutdown -r "+$M" "Rebooting for security maintenance" 2>&1
echo "Reboot scheduled in $M minute(s)."
exit 0
