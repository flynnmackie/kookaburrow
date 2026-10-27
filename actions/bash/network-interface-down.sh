NAME='Network - Interface Down'
DESCRIPTION='Brings one network interface down (ip link set down), cutting the host off from that network.'
DEPENDENCIES=()
PARAMETERS=(INTERFACE)
TAGS=(containment network)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$INTERFACE" | grep -Eq '^[A-Za-z0-9._:-]+$' || { echo "INTERFACE must be an interface name" >&2; exit 2; }
[ "$INTERFACE" != lo ] || { echo "Refusing to change the loopback interface" >&2; exit 2; }
ip link show "$INTERFACE" >/dev/null 2>&1 || { echo "No such interface: $INTERFACE" >&2; exit 1; }
$SUDO ip link set "$INTERFACE" down && echo "Interface $INTERFACE is down"
exit 0
