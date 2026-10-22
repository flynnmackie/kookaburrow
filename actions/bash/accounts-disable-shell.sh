NAME='Accounts - Disable Login Shell'
DESCRIPTION='Changes an account login shell to nologin so it can no longer log in interactively or over SSH with a shell, and records the old shell. Less drastic than locking the account (cron jobs and services running as it continue). Restore it by setting the shell back with Accounts - Restore Login Shell. Refuses root.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME)
TAGS=(accounts containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
[ "$(id -u "$USER_NAME")" -ne 0 ] || { echo "Refusing to change root" >&2; exit 2; }
old=$(getent passwd "$USER_NAME" | cut -d: -f7)
nologin=$(command -v nologin || echo /usr/sbin/nologin)
$SUDO mkdir -p /var/lib/kookaburrow && echo "$USER_NAME:$old" | $SUDO tee -a /var/lib/kookaburrow/old-shells >/dev/null
$SUDO usermod -s "$nologin" "$USER_NAME" && echo "Login shell of $USER_NAME changed from $old to $nologin"
exit 0
