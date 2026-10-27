NAME='Network - Socket Owners'
DESCRIPTION='Every open network socket with the process that owns it. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(CONTAINS?)
TAGS=(network processes c2)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Sockets (proto state recv send local remote process) =="
$SUDO ss -tunap 2>/dev/null | { if [ -n "$CONTAINS" ]; then grep -i -- "$CONTAINS"; else cat; fi; }
echo "== Executables of socket owners =="
$SUDO ss -tunap 2>/dev/null | grep -o 'pid=[0-9]*' | sort -u | cut -d= -f2 | while read -r p; do
  e=$(readlink "/proc/$p/exe" 2>/dev/null); [ -n "$e" ] && echo "pid=$p exe=$e cmd=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-200)"
done | { if [ -n "$CONTAINS" ]; then grep -i -- "$CONTAINS"; else cat; fi; }
exit 0
