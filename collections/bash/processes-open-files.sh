NAME='Processes - Open Files'
DESCRIPTION='Open files and network sockets of running processes from lsof. PID limits to one process; CONTAINS keeps lines containing that text (a path, a port or a program). Shows what a suspicious process is reading, writing and connected to. Needs lsof (part of most distributions) and root, or an account with passwordless sudo, for other users processes.'
DEPENDENCIES=()
PARAMETERS=(PID? CONTAINS?)
TAGS=(processes forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v lsof >/dev/null 2>&1 || { echo "lsof is not installed on this host" >&2; exit 1; }
case "$PID" in ''|*[!0-9]*) ARGS="";; *) ARGS="-p $PID";; esac
$SUDO lsof -n -P $ARGS 2>/dev/null | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | head -n 5000
exit 0
