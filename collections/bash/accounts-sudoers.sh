NAME='Accounts - Sudoers'
DESCRIPTION='Who can use sudo: the sudoers file and every file in sudoers.d (active lines only), members of the sudo, wheel, admin and root groups, and every NOPASSWD or ALL rule highlighted. A new sudoers entry or group membership is a standard privilege escalation and persistence step. Needs root, or an account with passwordless sudo.'
DEPENDENCIES=()
TAGS=(accounts privilege-escalation persistence)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== sudoers (active lines) =="
for f in /etc/sudoers /etc/sudoers.d/*; do
  [ -f "$f" ] || continue
  echo "-- $f (modified $(stat -c %y "$f" 2>/dev/null | cut -d. -f1))"
  $SUDO grep -vE '^\s*(#|$)' "$f" 2>/dev/null
done
echo "== Privileged group members =="
for g in sudo wheel admin root adm docker lxd disk shadow; do getent group "$g" 2>/dev/null; done
echo "== NOPASSWD and ALL rules =="
$SUDO grep -rE 'NOPASSWD|ALL *= *\(ALL' /etc/sudoers /etc/sudoers.d 2>/dev/null | grep -v '^\s*#'
exit 0
