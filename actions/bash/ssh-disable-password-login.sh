NAME='SSH - Disable Password Login'
DESCRIPTION='Turns off SSH password authentication (key login only) with a drop-in file (/etc/ssh/sshd_config.d/99-kookaburrow-password.conf), checks the configuration with sshd -t and reloads SSH. WARNING: if the account Kookaburrow uses to manage this host logs in with a password, you will lose contact. Set CONFIRM to YES only when you are sure key login works. Remove it with SSH - Remove Overrides.'
DEPENDENCIES=()
PARAMETERS=(CONFIRM)
TAGS=(ssh hardening containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ "$CONFIRM" = "YES" ] || { echo "Not changed: set CONFIRM to YES to acknowledge that password logins (possibly including this tool) will stop working" >&2; exit 2; }
grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d' /etc/ssh/sshd_config 2>/dev/null || { echo "sshd_config does not include sshd_config.d, so a drop-in would have no effect" >&2; exit 1; }
$SUDO mkdir -p /etc/ssh/sshd_config.d
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' | $SUDO tee /etc/ssh/sshd_config.d/99-kookaburrow-password.conf >/dev/null
if ! $SUDO sshd -t 2>&1; then $SUDO rm -f /etc/ssh/sshd_config.d/99-kookaburrow-password.conf; echo "sshd configuration check failed; the change was undone" >&2; exit 1; fi
$SUDO systemctl reload ssh 2>/dev/null || $SUDO systemctl reload sshd 2>/dev/null
echo "PasswordAuthentication is now: $($SUDO sshd -T 2>/dev/null | grep -i '^passwordauthentication')"
exit 0
