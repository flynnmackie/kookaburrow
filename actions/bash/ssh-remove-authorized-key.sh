NAME='SSH - Remove Authorized Key'
DESCRIPTION='Removes SSH public keys from an account authorized_keys file: every line containing KEY_TEXT (part of the key or its comment, shown by SSH - Keys and Config). The file is backed up to /var/quarantine-kookaburrow first and the removed lines are reported. Planted keys survive password resets, so this is a key containment step.'
DEPENDENCIES=()
PARAMETERS=(USER_NAME KEY_TEXT)
TAGS=(ssh persistence remediation accounts)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
[ -n "$USER_NAME" ] && [ -n "$KEY_TEXT" ] || { echo "USER_NAME and KEY_TEXT are required" >&2; exit 2; }
[ "${#KEY_TEXT}" -ge 6 ] || { echo "KEY_TEXT must be at least 6 characters so it cannot match every key" >&2; exit 2; }
home=$(getent passwd "$USER_NAME" | cut -d: -f6); [ -n "$home" ] || { echo "No such user: $USER_NAME" >&2; exit 1; }
f="$home/.ssh/authorized_keys"
$SUDO test -f "$f" || { echo "No authorized_keys file for $USER_NAME" >&2; exit 1; }
n=$($SUDO grep -cF -- "$KEY_TEXT" "$f")
[ "$n" -gt 0 ] || { echo "No key containing that text in $f"; exit 0; }
q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
$SUDO cp -p "$f" "$q/$(date +%Y%m%d-%H%M%S)_${USER_NAME}_authorized_keys.bak"
echo "Removing $n key line(s):"; $SUDO grep -F -- "$KEY_TEXT" "$f" | cut -c1-120
$SUDO sh -c "grep -vF -- \"\$1\" '$f' > '$f.kb.tmp'; cat '$f.kb.tmp' > '$f'; rm -f '$f.kb.tmp'" sh "$KEY_TEXT"
echo "Done. Remaining keys: $($SUDO grep -c . "$f")"
exit 0
