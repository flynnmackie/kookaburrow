NAME='SSH - Disable Root Login'
DESCRIPTION='Stops root logging in over SSH by adding a drop-in configuration file.'
DEPENDENCIES=()
TAGS=(ssh hardening containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d' /etc/ssh/sshd_config 2>/dev/null || { echo "sshd_config does not include sshd_config.d, so a drop-in would have no effect" >&2; exit 1; }
$SUDO mkdir -p /etc/ssh/sshd_config.d
echo "PermitRootLogin no" | $SUDO tee /etc/ssh/sshd_config.d/99-kookaburrow-root.conf >/dev/null
if ! $SUDO sshd -t 2>&1; then $SUDO rm -f /etc/ssh/sshd_config.d/99-kookaburrow-root.conf; echo "sshd configuration check failed; the change was undone" >&2; exit 1; fi
$SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd 2>/dev/null
echo "PermitRootLogin is now: $($SUDO sshd -T 2>/dev/null | grep -i '^permitrootlogin')"
exit 0
