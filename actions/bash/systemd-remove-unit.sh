NAME='Systemd - Remove Unit'
DESCRIPTION='Stops and disables a systemd unit and moves its unit file to /var/quarantine-kookaburrow, then reloads systemd. UNIT_NAME is the unit including its type (for example update-helper.service or backup.timer). Only unit files in /etc/systemd/system, /run/systemd/system or /usr/local/lib/systemd/system are touched, never packaged units. Use it to remove malicious persistence.'
DEPENDENCIES=()
PARAMETERS=(UNIT_NAME)
TAGS=(persistence systemd remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$UNIT_NAME" | grep -Eq '^[A-Za-z0-9:_.@-]+\.(service|timer|socket|path|mount)$' || { echo "UNIT_NAME must be a unit name such as name.service" >&2; exit 2; }
f=""; for d in /etc/systemd/system /run/systemd/system /usr/local/lib/systemd/system; do $SUDO test -f "$d/$UNIT_NAME" && f="$d/$UNIT_NAME"; done
[ -n "$f" ] || { echo "No locally added unit file named $UNIT_NAME (packaged units are never removed by this action)" >&2; exit 1; }
echo "Unit file: $f"; $SUDO grep -E '^(ExecStart|ExecStartPre|ExecStartPost)=' "$f"
echo "SHA256: $($SUDO sha256sum "$f" | cut -d' ' -f1)"
$SUDO systemctl stop "$UNIT_NAME" 2>&1; $SUDO systemctl disable "$UNIT_NAME" 2>&1
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
$SUDO mv -- "$f" "$q/$(date +%Y%m%d-%H%M%S)_$UNIT_NAME.quarantined" && $SUDO systemctl daemon-reload && $SUDO systemctl reset-failed 2>/dev/null
echo "Removed $UNIT_NAME and moved its unit file to quarantine"
exit 0
