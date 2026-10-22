NAME='Firewall - Unblock Port'
DESCRIPTION='Removes the iptables rules created by Firewall - Block Port for one port, in both chains and both protocols unless PROTOCOL (tcp or udp) or DIRECTION (in or out) is given.'
DEPENDENCIES=()
PARAMETERS=(PORT PROTOCOL? DIRECTION?)
TAGS=(network firewall recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PORT" in ''|*[!0-9]*) echo "PORT must be a number" >&2; exit 2;; esac
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
protos=${PROTOCOL:-"tcp udp"}; dirs=${DIRECTION:-"in out"}
n=0
for p in $protos; do for d in $dirs; do
  [ "$d" = in ] && chain=INPUT || chain=OUTPUT
  while $SUDO iptables -C "$chain" -p "$p" --dport "$PORT" -m comment --comment kookaburrow -j DROP 2>/dev/null; do $SUDO iptables -D "$chain" -p "$p" --dport "$PORT" -m comment --comment kookaburrow -j DROP && n=$((n+1)); done
done; done
[ "$n" -gt 0 ] && echo "Removed $n rule(s) for port $PORT" || echo "No Kookaburrow rules block port $PORT"
exit 0
