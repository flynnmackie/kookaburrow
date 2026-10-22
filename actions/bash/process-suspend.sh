NAME='Processes - Suspend'
DESCRIPTION='Freezes a process (SIGSTOP) without ending it, by PID. The process stays in memory with its connections, so you can image or inspect it, and continue it with Processes - Resume. Refuses PID 1.'
DEPENDENCIES=()
PARAMETERS=(PID)
TAGS=(containment process)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PID" in ''|*[!0-9]*) echo "PID must be a number" >&2; exit 2;; esac
[ "$PID" -gt 1 ] || { echo "Refusing to suspend PID $PID" >&2; exit 2; }
[ -d "/proc/$PID" ] || { echo "No process with PID $PID" >&2; exit 1; }
$SUDO kill -STOP "$PID" && echo "Suspended PID $PID: $(tr '\0' ' ' < /proc/$PID/cmdline 2>/dev/null | cut -c1-150) (state $(awk '/^State/ {print $2$3}' /proc/$PID/status))"
exit 0
