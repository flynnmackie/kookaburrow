NAME='Hosts File - Add Entry'
DESCRIPTION='Adds a line to /etc/hosts to sinkhole a domain: DOMAIN_NAME resolves to ADDRESS (default 0.0.0.0, which makes connections fail). /etc/hosts is backed up to /var/quarantine-kookaburrow first. Use DNS - Flush Cache afterwards.'
DEPENDENCIES=()
PARAMETERS=(DOMAIN_NAME ADDRESS?)
TAGS=(dns network containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$DOMAIN_NAME" | grep -Eq '^[A-Za-z0-9._-]+$' || { echo "DOMAIN_NAME may contain only letters, digits, dots, dashes and underscores" >&2; exit 2; }
a=${ADDRESS:-0.0.0.0}; echo "$a" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$' || { echo "ADDRESS must be an IP address" >&2; exit 2; }
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"; $SUDO cp -p /etc/hosts "$q/$(date +%Y%m%d-%H%M%S)_hosts.bak"
if grep -Eq "^[[:space:]]*[0-9a-fA-F:.]+[[:space:]]+$DOMAIN_NAME([[:space:]]|\$)" /etc/hosts; then echo "$DOMAIN_NAME is already in /etc/hosts"; exit 0; fi
echo "$a $DOMAIN_NAME # Kookaburrow sinkhole $(date +%FT%T)" | $SUDO tee -a /etc/hosts >/dev/null && echo "Added: $a $DOMAIN_NAME"
exit 0
