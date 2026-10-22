NAME='Firewall - Block Address'
DESCRIPTION='Drops inbound and outbound traffic for one remote IPv4 address using iptables (not persistent across reboots).'
DEPENDENCIES=()
PARAMETERS=(REMOTE_ADDRESS)
TAGS=(network firewall containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$REMOTE_ADDRESS" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || { echo "REMOTE_ADDRESS must be a single IPv4 address" >&2; exit 2; }
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
$SUDO iptables -C INPUT -s "$REMOTE_ADDRESS" -j DROP 2>/dev/null || $SUDO iptables -I INPUT -s "$REMOTE_ADDRESS" -j DROP
$SUDO iptables -C OUTPUT -d "$REMOTE_ADDRESS" -j DROP 2>/dev/null || $SUDO iptables -I OUTPUT -d "$REMOTE_ADDRESS" -j DROP
echo "Blocking $REMOTE_ADDRESS (INPUT and OUTPUT)"
$SUDO iptables -S | grep -F -- "$REMOTE_ADDRESS"
