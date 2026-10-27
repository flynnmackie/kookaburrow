NAME='Accounts - Force Password Change'
DESCRIPTION='Expires an account password so the user must choose a new one at the next login (chage -d 0).'
DEPENDENCIES=()
PARAMETERS=(USER_NAME)
TAGS=(accounts remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
$SUDO chage -d 0 "$USER_NAME" && echo "$USER_NAME must change the password at the next login"
$SUDO chage -l "$USER_NAME" | head -n 3
exit 0
