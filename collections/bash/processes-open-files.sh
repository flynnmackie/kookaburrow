NAME='Processes - Open Files'
DESCRIPTION='Open files and network sockets of running processes from lsof. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(PID? CONTAINS?)
TAGS=(processes forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v lsof >/dev/null 2>&1 || { echo "lsof is not installed on this host" >&2; exit 1; }
case "$PID" in ''|*[!0-9]*) ARGS="";; *) ARGS="-p $PID";; esac
$SUDO lsof -n -P $ARGS 2>/dev/null | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | head -n 5000
exit 0
