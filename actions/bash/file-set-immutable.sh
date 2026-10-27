NAME='Files - Set Immutable'
DESCRIPTION='Makes a file immutable with chattr +i, so nothing (even root) can modify, delete or rename it until the flag is cleared. Needs a file system that supports attributes (ext4, xfs, btrfs).'
DEPENDENCIES=()
PARAMETERS=(FILE_PATH)
TAGS=(filesystem hardening containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$FILE_PATH" ] && $SUDO test -f "$FILE_PATH" || { echo "FILE_PATH must be an existing regular file" >&2; exit 2; }
command -v chattr >/dev/null || { echo "chattr is not available" >&2; exit 1; }
$SUDO chattr +i "$FILE_PATH" && echo "Immutable: $($SUDO lsattr -- "$FILE_PATH")"
exit 0
