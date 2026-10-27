NAME='Host - Power Off'
DESCRIPTION='Powers the host off after DELAY_MINUTES (default 1) with a message to logged-in users.'
DEPENDENCIES=()
PARAMETERS=(DELAY_MINUTES?)
TAGS=(containment host)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
M=${DELAY_MINUTES:-1}; case "$M" in ''|*[!0-9]*) echo "DELAY_MINUTES must be a number" >&2; exit 2;; esac
$SUDO shutdown -P "+$M" "Shutting down for security reasons" 2>&1
echo "Power off scheduled in $M minute(s)."
exit 0
