NAME='Files - Delete'
DESCRIPTION='Permanently deletes one file after recording its SHA-256, size and owner. No copy is kept: use Files - Quarantine instead when you may need the file again. FILE_PATH must be a single regular file.'
DEPENDENCIES=()
PARAMETERS=(FILE_PATH)
TAGS=(filesystem malware remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$FILE_PATH" ] || { echo "FILE_PATH is required" >&2; exit 2; }
$SUDO test -f "$FILE_PATH" || { echo "Not a regular file: $FILE_PATH" >&2; exit 1; }
echo "SHA256: $($SUDO sha256sum -- "$FILE_PATH" | cut -d' ' -f1)  Size: $($SUDO stat -c %s -- "$FILE_PATH") bytes  Owner: $($SUDO stat -c %U -- "$FILE_PATH")  Modified: $($SUDO stat -c %y -- "$FILE_PATH" | cut -d. -f1)"
$SUDO rm -f -- "$FILE_PATH" && echo "Deleted $FILE_PATH"
exit 0
