NAME='Accounts - Add to Group'
DESCRIPTION='Adds a user to a group such as sudo, wheel, docker or a custom group.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME GROUP_NAME)
TAGS=(accounts remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] && [ -n "$GROUP_NAME" ] || { echo "USER_NAME and GROUP_NAME are required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
getent group "$GROUP_NAME" >/dev/null || { echo "No such group: $GROUP_NAME" >&2; exit 1; }
$SUDO usermod -aG "$GROUP_NAME" "$USER_NAME" && echo "Added $USER_NAME to $GROUP_NAME. Members: $(getent group "$GROUP_NAME" | cut -d: -f4)"
exit 0
