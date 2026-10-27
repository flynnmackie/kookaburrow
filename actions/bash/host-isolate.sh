NAME='Host - Isolate'
DESCRIPTION='Network-isolates the host with iptables: the current rules are saved, then only loopback and traffic with ALLOWED_ADDRESSES (comma separated IPv4 addresses, which must include this Kookaburrow server or you will lose contact) are allowed in both directions and everything else is dropped. Needs iptables and root, or an account with passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(ALLOWED_ADDRESSES AUTO_RELEASE_MINUTES?)
TAGS=(containment network firewall)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v iptables >/dev/null || { echo "iptables is not installed" >&2; exit 1; }
[ -n "$ALLOWED_ADDRESSES" ] || { echo "ALLOWED_ADDRESSES is required: list at least the address of the Kookaburrow server, or you will lose contact with this host" >&2; exit 2; }
addrs=$(echo "$ALLOWED_ADDRESSES" | tr ',; ' '\n' | grep -v '^$')
for a in $addrs; do echo "$a" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$' || { echo "Not a valid IPv4 address or range: $a" >&2; exit 2; }; done
D=/var/lib/kookaburrow
$SUDO mkdir -p "$D"
[ -f "$D/isolation-iptables.save" ] && { echo "The host is already isolated. Use Host - Release first." >&2; exit 1; }
$SUDO sh -c "iptables-save > $D/isolation-iptables.save"
# release script, used by Host - Release and by the automatic release
$SUDO tee "$D/release-isolation.sh" >/dev/null <<'EOS'
#!/bin/sh
D=/var/lib/kookaburrow
[ -f "$D/isolation-iptables.save" ] || exit 0
iptables-restore < "$D/isolation-iptables.save" && rm -f "$D/isolation-iptables.save"
systemctl stop kookaburrow-isolation-release.timer 2>/dev/null
EOS
$SUDO chmod 700 "$D/release-isolation.sh"
case "$AUTO_RELEASE_MINUTES" in ''|*[!0-9]*) ;; *)
  if [ "$AUTO_RELEASE_MINUTES" -gt 0 ]; then
    if command -v systemd-run >/dev/null 2>&1; then $SUDO systemd-run --quiet --unit=kookaburrow-isolation-release --on-active="${AUTO_RELEASE_MINUTES}m" "$D/release-isolation.sh" && echo "Automatic release scheduled in $AUTO_RELEASE_MINUTES minutes (systemd timer)"
    else $SUDO sh -c "nohup sh -c 'sleep $((AUTO_RELEASE_MINUTES * 60)); $D/release-isolation.sh' >/dev/null 2>&1 &" && echo "Automatic release scheduled in $AUTO_RELEASE_MINUTES minutes"; fi
  fi;;
esac
# allow rules first, then the drops, so contact is never lost
$SUDO iptables -I INPUT 1 -i lo -j ACCEPT; $SUDO iptables -I OUTPUT 1 -o lo -j ACCEPT
for a in $addrs; do $SUDO iptables -I INPUT 1 -s "$a" -j ACCEPT; $SUDO iptables -I OUTPUT 1 -d "$a" -j ACCEPT; done
$SUDO iptables -P INPUT DROP; $SUDO iptables -P OUTPUT DROP; $SUDO iptables -P FORWARD DROP
echo "Isolated: only $(echo $addrs | tr '\n' ' ')can reach this host. Use Host - Release to undo."
exit 0
