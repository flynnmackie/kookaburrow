NAME='Files - Hash'
DESCRIPTION='Computes hashes (SHA-256 by default; md5, sha1, sha256 or sha512 with ALGORITHM) of one file or every file in a folder, with size and modified time. Use it to check a file against a known-bad list or to confirm a binary is the same on every host. TARGET_PATH is required; set RECURSE to yes to include subfolders.'
DEPENDENCIES=()
PARAMETERS=(TARGET_PATH ALGORITHM? RECURSE?)
TAGS=(filesystem forensics malware)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
case "${ALGORITHM:-sha256}" in md5|sha1|sha256|sha512) A=${ALGORITHM:-sha256};; *) echo "ALGORITHM must be md5, sha1, sha256 or sha512" >&2; exit 1;; esac
if [ -f "$TARGET_PATH" ]; then list="$TARGET_PATH"; else
  case "$RECURSE" in y|yes|true|1) list=$($SUDO find "$TARGET_PATH" -type f 2>/dev/null);; *) list=$($SUDO find "$TARGET_PATH" -maxdepth 1 -type f 2>/dev/null);; esac
fi
echo "hash	algorithm	size	modified	path"
printf '%s\n' "$list" | while read -r f; do [ -n "$f" ] || continue
  printf '%s\t%s\t%s\t%s\t%s\n' "$($SUDO ${A}sum "$f" 2>/dev/null | cut -d' ' -f1)" "$A" "$(stat -c %s "$f" 2>/dev/null)" "$(stat -c %y "$f" 2>/dev/null | cut -d. -f1)" "$f"
done
exit 0
