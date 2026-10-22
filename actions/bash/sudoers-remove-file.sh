NAME='Accounts - Remove Sudoers File'
DESCRIPTION='Removes one file from /etc/sudoers.d (moved to /var/quarantine-kookaburrow) and checks that the sudoers configuration is still valid with visudo. SUDOERS_FILE is the file name only. Attackers add a file here to give an account passwordless root. The file content is reported first. The main /etc/sudoers file is never touched.'
DEPENDENCIES=()
PARAMETERS=(SUDOERS_FILE)
TAGS=(accounts privilege-escalation persistence remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$SUDOERS_FILE" in ''|*/*|.*) echo "SUDOERS_FILE must be a file name without a path" >&2; exit 2;; esac
f="/etc/sudoers.d/$SUDOERS_FILE"
$SUDO test -f "$f" || { echo "Not found: $f" >&2; exit 1; }
echo "Content:"; $SUDO grep -vE '^\s*(#|$)' "$f"
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
dest="$q/$(date +%Y%m%d-%H%M%S)_sudoers_$SUDOERS_FILE.quarantined"
$SUDO mv -- "$f" "$dest" && echo "Moved $f to quarantine"
if command -v visudo >/dev/null 2>&1 && ! $SUDO visudo -c >/dev/null 2>&1; then $SUDO mv -- "$dest" "$f"; echo "visudo found a problem after removal; the file was put back" >&2; exit 1; fi
echo "sudoers configuration is valid"
exit 0
