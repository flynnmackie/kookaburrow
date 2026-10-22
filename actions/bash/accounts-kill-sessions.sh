NAME='Accounts - Kill Sessions'
DESCRIPTION='Ends every login session and process of one account without locking it: terminates its logind sessions and kills its remaining processes. Use it to throw an attacker out of a compromised account; follow with Accounts - Lock User or a password reset to keep them out. Refuses root.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME)
TAGS=(accounts containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
[ "$(id -u "$USER_NAME")" -ne 0 ] || { echo "Refusing to end root sessions" >&2; exit 2; }
echo "Sessions before: $(who | awk -v u="$USER_NAME" '$1==u' | wc -l)"
$SUDO loginctl terminate-user "$USER_NAME" 2>/dev/null
$SUDO pkill -KILL -u "$USER_NAME" 2>/dev/null && echo "Killed processes of $USER_NAME" || echo "No running processes for $USER_NAME"
exit 0
