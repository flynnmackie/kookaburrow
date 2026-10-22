NAME='Firewall - Unblock Address'
DESCRIPTION='Removes the iptables rules created by Firewall - Block Address for one remote IPv4 address, restoring traffic to and from it.'
DEPENDENCIES=()
PARAMETERS=(REMOTE_ADDRESS)
TAGS=(network firewall recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$REMOTE_ADDRESS" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "REMOTE_ADDRESS must be a single IPv4 address" >&2; exit 2; }
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
n=0
while $SUDO iptables -C INPUT -s "$REMOTE_ADDRESS" -j DROP 2>/dev/null; do $SUDO iptables -D INPUT -s "$REMOTE_ADDRESS" -j DROP && n=$((n+1)); done
while $SUDO iptables -C OUTPUT -d "$REMOTE_ADDRESS" -j DROP 2>/dev/null; do $SUDO iptables -D OUTPUT -d "$REMOTE_ADDRESS" -j DROP && n=$((n+1)); done
[ "$n" -gt 0 ] && echo "Removed $n rule(s) for $REMOTE_ADDRESS" || echo "No block rules exist for $REMOTE_ADDRESS"
exit 0
