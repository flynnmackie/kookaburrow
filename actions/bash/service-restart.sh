NAME='Services - Restart'
DESCRIPTION='Restarts a systemd service by name, for example after changing its configuration or to reload a security agent.'
DEPENDENCIES=()
PARAMETERS=(SERVICE_NAME)
TAGS=(recovery services systemd)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$SERVICE_NAME" | grep -Eq '^[A-Za-z0-9:_.@-]+$' || { echo "SERVICE_NAME is required (letters, digits and . _ - @ only)" >&2; exit 2; }
$SUDO systemctl restart "$SERVICE_NAME" 2>&1 || { echo "Could not restart $SERVICE_NAME" >&2; exit 1; }
echo "$SERVICE_NAME is $($SUDO systemctl is-active "$SERVICE_NAME")"
exit 0
