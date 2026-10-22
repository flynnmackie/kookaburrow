NAME='Processes - Resume'
DESCRIPTION='Continues a process that was frozen with Processes - Suspend (SIGCONT), by PID.'
DEPENDENCIES=()
PARAMETERS=(PID)
TAGS=(recovery process)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PID" in ''|*[!0-9]*) echo "PID must be a number" >&2; exit 2;; esac
[ -d "/proc/$PID" ] || { echo "No process with PID $PID" >&2; exit 1; }
$SUDO kill -CONT "$PID" && echo "Resumed PID $PID (state $(awk '/^State/ {print $2$3}' /proc/$PID/status))"
exit 0
