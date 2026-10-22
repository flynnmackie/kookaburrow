NAME='SSH - Remove Overrides'
DESCRIPTION='Removes the SSH drop-in files created by SSH - Disable Root Login and SSH - Disable Password Login, checks the configuration and reloads SSH, putting the SSH daemon back to how its main configuration sets it.'
DEPENDENCIES=()
TAGS=(ssh recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
n=0
for f in /etc/ssh/sshd_config.d/99-kookaburrow-root.conf /etc/ssh/sshd_config.d/99-kookaburrow-password.conf; do $SUDO test -f "$f" && { $SUDO rm -f "$f"; echo "Removed $f"; n=$((n+1)); }; done
[ "$n" -gt 0 ] || { echo "No Kookaburrow SSH overrides present"; exit 0; }
$SUDO sshd -t 2>&1 || { echo "sshd configuration check failed after removal" >&2; exit 1; }
$SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd 2>/dev/null
echo "SSH reloaded."
exit 0
