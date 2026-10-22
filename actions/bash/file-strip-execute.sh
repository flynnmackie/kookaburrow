NAME='Files - Remove Execute Permission'
DESCRIPTION='Removes the execute bit from a file for everyone (chmod a-x) and clears SUID and SGID, so it can no longer be run directly, and reports the old mode. A softer alternative to deleting or quarantining a suspicious binary or script.'
DEPENDENCIES=()
PARAMETERS=(FILE_PATH)
TAGS=(filesystem containment malware)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$FILE_PATH" ] && $SUDO test -f "$FILE_PATH" || { echo "FILE_PATH must be an existing regular file" >&2; exit 2; }
old=$($SUDO stat -c '%a %A' -- "$FILE_PATH")
$SUDO chmod a-x,u-s,g-s -- "$FILE_PATH" && echo "Mode changed from $old to $($SUDO stat -c '%a %A' -- "$FILE_PATH"): $FILE_PATH"
exit 0
