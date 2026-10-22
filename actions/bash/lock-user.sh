NAME='Accounts - Lock User'
DESCRIPTION='Locks the account password, expires the account so key-based logins are refused, and terminates all processes owned by the user (reversible).'
DEPENDENCIES=()
PARAMETERS=(USER_NAME)
TAGS=(accounts containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
[ "$(id -u "$USER_NAME")" -ne 0 ] || { echo "Refusing to lock root" >&2; exit 2; }
$SUDO usermod -L -e 1 -- "$USER_NAME" && echo "Locked and expired $USER_NAME"
$SUDO pkill -KILL -u "$USER_NAME" 2>/dev/null && echo "Killed processes owned by $USER_NAME" || echo "No running processes for $USER_NAME"
