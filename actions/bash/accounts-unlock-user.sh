NAME='Accounts - Unlock User'
DESCRIPTION='Unlocks an account that was locked with Accounts - Lock User: removes the password lock and the account expiry so it can log in again.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME)
TAGS=(accounts recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
$SUDO usermod -U -e "" -- "$USER_NAME" && echo "Unlocked $USER_NAME"
$SUDO passwd -S "$USER_NAME" 2>/dev/null
exit 0
