NAME='Accounts - Restore Login Shell'
DESCRIPTION='Puts an account login shell back to what it was before Accounts - Disable Login Shell (read from the saved record), or to SHELL_PATH if you give one (it must be listed in /etc/shells).'
DEPENDENCIES=()
PARAMETERS=(USER_NAME SHELL_PATH?)
TAGS=(accounts recovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] || { echo "USER_NAME is required" >&2; exit 2; }
id "$USER_NAME" >/dev/null 2>&1 || { echo "No such user: $USER_NAME" >&2; exit 1; }
sh=${SHELL_PATH:-$($SUDO grep "^$USER_NAME:" /var/lib/kookaburrow/old-shells 2>/dev/null | tail -n 1 | cut -d: -f2)}
[ -n "$sh" ] || { echo "No saved shell for $USER_NAME; give SHELL_PATH" >&2; exit 1; }
grep -qxF "$sh" /etc/shells || { echo "$sh is not listed in /etc/shells" >&2; exit 2; }
$SUDO usermod -s "$sh" "$USER_NAME" && echo "Login shell of $USER_NAME is now $sh"
exit 0
