NAME='Services - Stop and Disable'
DESCRIPTION='Stops a systemd service and disables it so it does not start again at boot.'
DEPENDENCIES=()
PARAMETERS=(SERVICE_NAME)
TAGS=(services persistence containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$SERVICE_NAME" ] || { echo "SERVICE_NAME is required" >&2; exit 2; }
echo "$SERVICE_NAME" | grep -Eq '^[A-Za-z0-9@._-]+$' || { echo "SERVICE_NAME contains invalid characters" >&2; exit 2; }
echo "Before: $(systemctl is-active "$SERVICE_NAME" 2>&1) / $(systemctl is-enabled "$SERVICE_NAME" 2>&1)"
$SUDO systemctl stop "$SERVICE_NAME" && $SUDO systemctl disable "$SERVICE_NAME"
echo "After:  $(systemctl is-active "$SERVICE_NAME" 2>&1) / $(systemctl is-enabled "$SERVICE_NAME" 2>&1)"
