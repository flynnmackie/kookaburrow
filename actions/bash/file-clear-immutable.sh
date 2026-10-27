NAME='Files - Clear Immutable'
DESCRIPTION='Clears the immutable flag (chattr -i) from a file so it can be changed or deleted again.'
DEPENDENCIES=()
PARAMETERS=(FILE_PATH)
TAGS=(filesystem recovery remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$FILE_PATH" ] && $SUDO test -e "$FILE_PATH" || { echo "FILE_PATH must be an existing file" >&2; exit 2; }
command -v chattr >/dev/null || { echo "chattr is not available" >&2; exit 1; }
echo "Before: $($SUDO lsattr -d -- "$FILE_PATH")"
$SUDO chattr -i -a "$FILE_PATH" && echo "After:  $($SUDO lsattr -d -- "$FILE_PATH")"
exit 0
