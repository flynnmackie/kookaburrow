NAME='Logs - Journal Query'
DESCRIPTION='Reads the systemd journal with filters. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(LAST_MINUTES? SINCE? UNTIL? UNIT? PRIORITY? GREP? MAX_LINES?)
TAGS=(event-logs forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v journalctl >/dev/null 2>&1 || { echo "journalctl is not available on this host" >&2; exit 1; }
M=${MAX_LINES:-3000}; case "$M" in ''|*[!0-9]*) M=3000;; esac
args=(--no-pager -o short-iso)
case "$LAST_MINUTES" in ''|*[!0-9]*) ;; *) SINCE="$LAST_MINUTES minutes ago";; esac
args+=(--since "${SINCE:-24 hours ago}")
[ -n "$UNTIL" ] && args+=(--until "$UNTIL")
[ -n "$UNIT" ] && args+=(-u "$UNIT")
[ -n "$PRIORITY" ] && args+=(-p "$PRIORITY")
[ -n "$GREP" ] && args+=(-g "$GREP")
$SUDO journalctl "${args[@]}" 2>&1 | tail -n "$M"
exit 0
