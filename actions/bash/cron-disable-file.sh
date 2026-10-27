NAME='Cron - Disable File'
DESCRIPTION='Disables a file in /etc/cron.d (or a script in /etc/cron.hourly, daily, weekly or monthly) by moving it to /var/quarantine-kookaburrow, so it stops running.'
DEPENDENCIES=()
PARAMETERS=(CRON_FILE FOLDER?)
TAGS=(persistence cron remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$CRON_FILE" in ''|*/*|.*) echo "CRON_FILE must be a file name without a path" >&2; exit 2;; esac
fold=${FOLDER:-cron.d}; case "$fold" in cron.d|cron.hourly|cron.daily|cron.weekly|cron.monthly) ;; *) echo "FOLDER must be cron.d, cron.hourly, cron.daily, cron.weekly or cron.monthly" >&2; exit 2;; esac
f="/etc/$fold/$CRON_FILE"
$SUDO test -f "$f" || { echo "Not found: $f" >&2; exit 1; }
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
echo "SHA256: $($SUDO sha256sum "$f" | cut -d' ' -f1)"
$SUDO mv -- "$f" "$q/$(date +%Y%m%d-%H%M%S)_$CRON_FILE.quarantined" && echo "Moved $f to quarantine"
exit 0
