NAME='Processes - Environment'
DESCRIPTION='The command line, working directory, environment variables and loaded libraries of one process, read from /proc. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(PID)
TAGS=(processes forensics malware)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PID" in ''|*[!0-9]*) echo "PID must be a number" >&2; exit 1;; esac
[ -d "/proc/$PID" ] || { echo "no process $PID" >&2; exit 1; }
echo "== cmdline =="; $SUDO cat "/proc/$PID/cmdline" | tr '\0' ' '; echo
echo "== exe / cwd / root =="; $SUDO ls -l "/proc/$PID/exe" "/proc/$PID/cwd" "/proc/$PID/root" 2>/dev/null
echo "== status =="; grep -E '^(Name|State|PPid|Uid|Gid|Threads|VmRSS|CapEff)' "/proc/$PID/status" 2>/dev/null
echo "== environment =="; $SUDO cat "/proc/$PID/environ" 2>/dev/null | tr '\0' '\n'
echo "== loaded libraries =="; $SUDO awk '{print $6}' "/proc/$PID/maps" 2>/dev/null | grep '^/' | sort -u
echo "== open files =="; $SUDO ls -l "/proc/$PID/fd" 2>/dev/null | tail -n +2
exit 0
