NAME='Accounts - Remove from Group'
DESCRIPTION='Removes a user from a group, for example from sudo or wheel to take away rights an attacker granted.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME GROUP_NAME)
TAGS=(accounts remediation containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] && [ -n "$GROUP_NAME" ] || { echo "USER_NAME and GROUP_NAME are required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
getent group "$GROUP_NAME" >/dev/null || { echo "No such group: $GROUP_NAME" >&2; exit 1; }
$SUDO gpasswd -d "$USER_NAME" "$GROUP_NAME" 2>&1 && echo "Removed $USER_NAME from $GROUP_NAME. Members: $(getent group "$GROUP_NAME" | cut -d: -f4)"
exit 0
