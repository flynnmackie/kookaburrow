NAME='Processes - Kill by Name'
DESCRIPTION='Sends SIGKILL to every process whose command name exactly matches the given name, and reports what was killed.'
DEPENDENCIES=()
PARAMETERS=(PROCESS_NAME)
TAGS=(containment process)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$PROCESS_NAME" ] || { echo "PROCESS_NAME is required" >&2; exit 2; }
pids=$(pgrep -x -- "$PROCESS_NAME")
[ -n "$pids" ] || { echo "No process named $PROCESS_NAME is running."; exit 0; }
for pid in $pids; do
  [ "$pid" = "$$" ] && continue
  info=$(ps -o pid=,user=,args= -p "$pid" 2>/dev/null)
  if $SUDO kill -9 "$pid" 2>/dev/null; then echo "Killed: $info"; else echo "FAILED: $info" >&2; fi
done
