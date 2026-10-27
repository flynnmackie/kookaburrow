NAME='Persistence - Clear ld.so.preload'
DESCRIPTION='Moves /etc/ld.so.preload to /var/quarantine-kookaburrow, which stops every program loading the libraries it lists.'
DEPENDENCIES=()
TAGS=(persistence malware remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
f=/etc/ld.so.preload
$SUDO test -f "$f" || { echo "No $f present"; exit 0; }
echo "Content:"; $SUDO cat "$f"
echo "SHA256: $($SUDO sha256sum "$f" | cut -d' ' -f1)"
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
$SUDO mv -- "$f" "$q/$(date +%Y%m%d-%H%M%S)_ld.so.preload.quarantined" && echo "Moved $f to quarantine"
exit 0
