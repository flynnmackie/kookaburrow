NAME='Network - Interface Up'
DESCRIPTION='Brings a network interface that was taken down back up (ip link set up).'
DEPENDENCIES=()
PARAMETERS=(INTERFACE)
TAGS=(recovery network)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$INTERFACE" | grep -Eq '^[A-Za-z0-9._:-]+$' || { echo "INTERFACE must be an interface name" >&2; exit 2; }
ip link show "$INTERFACE" >/dev/null 2>&1 || { echo "No such interface: $INTERFACE" >&2; exit 1; }
$SUDO ip link set "$INTERFACE" up && echo "Interface $INTERFACE is up"
exit 0
