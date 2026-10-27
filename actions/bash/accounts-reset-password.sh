NAME='Accounts - Reset Password'
DESCRIPTION='Sets a new password on a local account.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME NEW_PASSWORD)
TAGS=(accounts remediation containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] && [ -n "$NEW_PASSWORD" ] || { echo "USER_NAME and NEW_PASSWORD are required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
printf '%s:%s\n' "$USER_NAME" "$NEW_PASSWORD" | $SUDO chpasswd && echo "Password reset for $USER_NAME"
exit 0
