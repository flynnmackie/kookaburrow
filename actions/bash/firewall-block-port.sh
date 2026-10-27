NAME='Firewall - Block Port'
DESCRIPTION='Drops traffic for one TCP or UDP port with iptables (not persistent across reboots).'
DEPENDENCIES=()
PARAMETERS=(PORT PROTOCOL? DIRECTION?)
TAGS=(network firewall containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "$PORT" in ''|*[!0-9]*) echo "PORT must be a number" >&2; exit 2;; esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || { echo "PORT must be from 1 to 65535" >&2; exit 2; }
P=$(echo "${PROTOCOL:-tcp}" | tr 'A-Z' 'a-z'); case "$P" in tcp|udp) ;; *) echo "PROTOCOL must be tcp or udp" >&2; exit 2;; esac
D=$(echo "${DIRECTION:-in}" | tr 'A-Z' 'a-z'); case "$D" in in|out) ;; *) echo "DIRECTION must be in or out" >&2; exit 2;; esac
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
if [ "$D" = in ]; then chain=INPUT; opt=--dport; else chain=OUTPUT; opt=--dport; fi
$SUDO iptables -C "$chain" -p "$P" "$opt" "$PORT" -m comment --comment kookaburrow -j DROP 2>/dev/null || $SUDO iptables -I "$chain" -p "$P" "$opt" "$PORT" -m comment --comment kookaburrow -j DROP
echo "Blocking $P port $PORT ($chain)"
$SUDO iptables -S "$chain" | grep -F -- "--dport $PORT" | head -n 3
exit 0
