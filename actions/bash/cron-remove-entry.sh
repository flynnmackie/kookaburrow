NAME='Cron - Remove Entry'
DESCRIPTION='Removes every line of a user crontab that contains CRON_TEXT (part of the command), after saving a backup of the crontab to /var/quarantine-kookaburrow. The removed lines are reported. Use Cron - All Jobs to find the exact text.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME CRON_TEXT)
TAGS=(persistence cron remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] && [ -n "$CRON_TEXT" ] || { echo "USER_NAME and CRON_TEXT are required" >&2; exit 2; }
[ "${#CRON_TEXT}" -ge 4 ] || { echo "CRON_TEXT must be at least 4 characters" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
cur=$($SUDO crontab -u "$USER_NAME" -l 2>/dev/null) || { echo "$USER_NAME has no crontab" >&2; exit 1; }
n=$(printf '%s\n' "$cur" | grep -cF -- "$CRON_TEXT")
[ "$n" -gt 0 ] || { echo "No line containing that text in the crontab of $USER_NAME"; exit 0; }
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
printf '%s\n' "$cur" | $SUDO tee "$q/$(date +%Y%m%d-%H%M%S)_crontab_$USER_NAME.bak" >/dev/null
echo "Removing $n line(s):"; printf '%s\n' "$cur" | grep -F -- "$CRON_TEXT" | cut -c1-160
printf '%s\n' "$cur" | grep -vF -- "$CRON_TEXT" | $SUDO crontab -u "$USER_NAME" -
echo "Crontab of $USER_NAME updated."
exit 0
