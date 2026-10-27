NAME='Host - Release'
DESCRIPTION='Undoes Host - Isolate: restores the iptables rules that were saved before isolation and cancels any automatic release.'
DEPENDENCIES=()
TAGS=(containment network recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=/var/lib/kookaburrow
$SUDO test -f "$D/isolation-iptables.save" || { echo "The host is not isolated (no saved rules)."; exit 0; }
$SUDO iptables -P INPUT ACCEPT; $SUDO iptables -P OUTPUT ACCEPT; $SUDO iptables -P FORWARD ACCEPT
$SUDO "$D/release-isolation.sh"
$SUDO test -f "$D/isolation-iptables.save" && { echo "Release did not complete: the saved rules are still present" >&2; exit 1; }
$SUDO systemctl stop kookaburrow-isolation-release.timer 2>/dev/null
echo "Released: the previous firewall rules are restored."
exit 0
