NAME='Logs - Search'
DESCRIPTION='Searches log files for a text pattern (a regular expression, case insensitive). Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(PATTERN LOG_PATH? DAYS? MAX_LINES?)
TAGS=(event-logs forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-14}; case "$D" in ''|*[!0-9]*) D=14;; esac
M=${MAX_LINES:-2000}; case "$M" in ''|*[!0-9]*) M=2000;; esac
R=${LOG_PATH:-/var/log}
$SUDO find "$R" -type f -mtime "-$D" 2>/dev/null | while read -r f; do
  case "$f" in
    *.gz) $SUDO zcat "$f" 2>/dev/null | grep -iE -- "$PATTERN" | sed "s|^|$f: |";;
    *) $SUDO grep -IiE -- "$PATTERN" "$f" 2>/dev/null | sed "s|^|$f: |";;
  esac
done | head -n "$M"
exit 0
