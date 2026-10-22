NAME='Services - Start'
DESCRIPTION='Starts a systemd service by name, and optionally enables it at boot (ENABLE set to yes), for example to bring back a security agent or logging service that was stopped.'
DEPENDENCIES=()
PARAMETERS=(SERVICE_NAME ENABLE?)
TAGS=(recovery services systemd)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$SERVICE_NAME" | grep -Eq '^[A-Za-z0-9:_.@-]+$' || { echo "SERVICE_NAME is required (letters, digits and . _ - @ only)" >&2; exit 2; }
case "$ENABLE" in y|yes|true|1) $SUDO systemctl enable "$SERVICE_NAME" 2>&1;; esac
$SUDO systemctl start "$SERVICE_NAME" 2>&1 || { echo "Could not start $SERVICE_NAME" >&2; exit 1; }
echo "$SERVICE_NAME is $($SUDO systemctl is-active "$SERVICE_NAME")"
exit 0
