NAME='Processes - Kill by PID'
DESCRIPTION='Sends SIGKILL to one process by its process id. Use when a name is ambiguous or the process is masquerading.'
DEPENDENCIES=()
PARAMETERS=(PID)
TAGS=(containment process)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PID" in ''|*[!0-9]*) echo "PID is required and must be a number" >&2; exit 2;; esac
[ "$PID" -gt 1 ] || { echo "Refusing to kill PID $PID" >&2; exit 2; }
info=$(ps -o pid=,user=,args= -p "$PID" 2>/dev/null)
[ -n "$info" ] || { echo "No process with PID $PID."; exit 0; }
$SUDO kill -9 "$PID" && echo "Killed: $info"
