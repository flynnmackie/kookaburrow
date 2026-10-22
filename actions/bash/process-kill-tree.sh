NAME='Processes - Kill Tree'
DESCRIPTION='Stops a process and everything it started (all child and grandchild processes) by PID: children first, then the process. Use it when malware spawns helpers that would restart the parent. Refuses PID 1 and this shell.'
DEPENDENCIES=()
PARAMETERS=(PID)
TAGS=(containment process)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PID" in ''|*[!0-9]*) echo "PID must be a number" >&2; exit 2;; esac
[ "$PID" -gt 1 ] && [ "$PID" != "$$" ] || { echo "Refusing to kill PID $PID" >&2; exit 2; }
[ -d "/proc/$PID" ] || { echo "No process with PID $PID"; exit 0; }
kids() { for c in $(pgrep -P "$1" 2>/dev/null); do kids "$c"; echo "$c"; done; }
list="$(kids "$PID") $PID"
for p in $list; do
  [ "$p" = "$$" ] && continue
  echo "Killing PID $p: $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-150)"
  $SUDO kill -KILL "$p" 2>/dev/null
done
exit 0
