NAME='Accounts - Delete User'
DESCRIPTION='Deletes a local account and ends its processes.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME REMOVE_HOME?)
TAGS=(accounts remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
[ "$(id -u "$USER_NAME")" -ge 100 ] || { echo "Refusing to delete a system account ($USER_NAME, uid $(id -u "$USER_NAME"))" >&2; exit 2; }
echo "Account: $(getent passwd "$USER_NAME")"
$SUDO pkill -KILL -u "$USER_NAME" 2>/dev/null
case "$REMOVE_HOME" in y|yes|true|1) $SUDO userdel -r "$USER_NAME" 2>&1; echo "Deleted $USER_NAME and removed the home directory";; *) $SUDO userdel "$USER_NAME" 2>&1; echo "Deleted $USER_NAME (home directory kept)";; esac
exit 0
