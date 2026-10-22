NAME='Logs - Journal Query'
DESCRIPTION='Reads the systemd journal with filters. LAST_MINUTES (for example 120) selects the last N minutes; or SINCE and UNTIL take times such as "2026-10-22 08:00" or "2 hours ago" (default is the last 24 hours). UNIT limits to one service (for example sshd.service), PRIORITY to a level (0 emerg to 7 debug, or a name such as err), GREP to messages containing a regular expression. MAX_LINES defaults to 3000. Needs root, or an account with passwordless sudo, to read all logs.'
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
