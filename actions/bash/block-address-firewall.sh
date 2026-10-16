NAME='Block remote address in firewall'
DESCRIPTION='Drops inbound and outbound traffic for one remote IPv4 address using iptables (not persistent across reboots).'
DEPENDENCIES=()
PARAMETERS=(REMOTE_ADDRESS)
TAGS=(network firewall containment)

echo "$REMOTE_ADDRESS" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "REMOTE_ADDRESS must be a single IPv4 address" >&2; exit 2; }
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
iptables -C INPUT -s "$REMOTE_ADDRESS" -j DROP 2>/dev/null || iptables -I INPUT -s "$REMOTE_ADDRESS" -j DROP
iptables -C OUTPUT -d "$REMOTE_ADDRESS" -j DROP 2>/dev/null || iptables -I OUTPUT -d "$REMOTE_ADDRESS" -j DROP
echo "Blocking $REMOTE_ADDRESS (INPUT and OUTPUT)"
iptables -S | grep -F -- "$REMOTE_ADDRESS"
