NAME='Files - Restore Quarantined'
DESCRIPTION='Moves a file out of /var/quarantine-kookaburrow back to a location you choose.'
DEPENDENCIES=()
PARAMETERS=(QUARANTINED_NAME RESTORE_PATH)
TAGS=(filesystem recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$QUARANTINED_NAME" in ''|*/*) echo "QUARANTINED_NAME must be just the file name inside the quarantine folder" >&2; exit 2;; esac
src="/var/quarantine-kookaburrow/$QUARANTINED_NAME"
$SUDO test -f "$src" || { echo "Not in quarantine: $QUARANTINED_NAME" >&2; exit 1; }
[ -n "$RESTORE_PATH" ] && ! $SUDO test -e "$RESTORE_PATH" || { echo "RESTORE_PATH is required and must not already exist" >&2; exit 2; }
$SUDO mkdir -p "$(dirname "$RESTORE_PATH")"
$SUDO mv -- "$src" "$RESTORE_PATH" && $SUDO chmod 600 "$RESTORE_PATH" && echo "Restored to $RESTORE_PATH (SHA256 $($SUDO sha256sum -- "$RESTORE_PATH" | cut -d' ' -f1))"
exit 0
