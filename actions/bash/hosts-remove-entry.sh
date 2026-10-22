NAME='Hosts File - Remove Entry'
DESCRIPTION='Removes every /etc/hosts line for a domain name, for example to undo Hosts File - Add Entry. /etc/hosts is backed up to /var/quarantine-kookaburrow first. Lines for localhost are never removed.'
DEPENDENCIES=()
PARAMETERS=(DOMAIN_NAME)
TAGS=(dns network recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$DOMAIN_NAME" | grep -Eq '^[A-Za-z0-9._-]+$' || { echo "DOMAIN_NAME may contain only letters, digits, dots, dashes and underscores" >&2; exit 2; }
[ "$DOMAIN_NAME" != localhost ] || { echo "Refusing to remove localhost" >&2; exit 2; }
pat="^[[:space:]]*[0-9a-fA-F:.]+[[:space:]]+$DOMAIN_NAME([[:space:]]|\$)"
n=$(grep -Ec "$pat" /etc/hosts)
[ "$n" -gt 0 ] || { echo "No /etc/hosts entry for $DOMAIN_NAME"; exit 0; }
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"; $SUDO cp -p /etc/hosts "$q/$(date +%Y%m%d-%H%M%S)_hosts.bak"
grep -E "$pat" /etc/hosts | sed 's/^/Removed: /'
grep -Ev "$pat" /etc/hosts | $SUDO tee /etc/hosts.kb.tmp >/dev/null && $SUDO sh -c 'cat /etc/hosts.kb.tmp > /etc/hosts; rm -f /etc/hosts.kb.tmp'
exit 0
