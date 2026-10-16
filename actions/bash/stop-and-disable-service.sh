NAME='Stop and disable service'
DESCRIPTION='Stops a systemd service and disables it so it does not start again at boot.'
DEPENDENCIES=()
PARAMETERS=(SERVICE_NAME)
TAGS=(services persistence containment)

[ -n "$SERVICE_NAME" ] || { echo "SERVICE_NAME is required" >&2; exit 2; }
echo "$SERVICE_NAME" | grep -Eq '^[A-Za-z0-9@._-]+$' || { echo "SERVICE_NAME contains invalid characters" >&2; exit 2; }
echo "Before: $(systemctl is-active "$SERVICE_NAME" 2>&1) / $(systemctl is-enabled "$SERVICE_NAME" 2>&1)"
systemctl stop "$SERVICE_NAME" && systemctl disable "$SERVICE_NAME"
echo "After:  $(systemctl is-active "$SERVICE_NAME" 2>&1) / $(systemctl is-enabled "$SERVICE_NAME" 2>&1)"
