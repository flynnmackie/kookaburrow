NAME='Files - Search'
DESCRIPTION='Finds files under a folder by name pattern (wildcards, for example *.sh or id_rsa*), optionally only those changed in the last N days, with a size range, and with SHA-256 hashes. Returns modified time, size, owner, permissions and path. SEARCH_PATH is required. MAX_RESULTS defaults to 5000. Set HASH to yes to add hashes.'
DEPENDENCIES=()
PARAMETERS=(SEARCH_PATH NAME_PATTERN? MODIFIED_DAYS? MIN_SIZE_KB? MAX_SIZE_KB? HASH? MAX_RESULTS?)
TAGS=(filesystem forensics discovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
M=${MAX_RESULTS:-5000}; case "$M" in ''|*[!0-9]*) M=5000;; esac
args=()
[ -n "$NAME_PATTERN" ] && args+=(-name "$NAME_PATTERN")
case "$MODIFIED_DAYS" in ''|*[!0-9]*) ;; *) args+=(-mtime "-$MODIFIED_DAYS");; esac
case "$MIN_SIZE_KB" in ''|*[!0-9]*) ;; *) args+=(-size "+$((MIN_SIZE_KB * 1024 - 1))c");; esac
case "$MAX_SIZE_KB" in ''|*[!0-9]*) ;; *) args+=(-size "-$((MAX_SIZE_KB * 1024 + 1))c");; esac
echo "modified	size	owner	mode	path	sha256"
$SUDO find "$SEARCH_PATH" -xdev -type f "${args[@]}" -printf '%TY-%Tm-%Td %TH:%TM\t%s\t%u\t%m\t%p\n' 2>/dev/null | head -n "$M" | while IFS=$'\t' read -r t s o m p; do
  h=""; case "$HASH" in y|yes|true|1) h=$($SUDO sha256sum "$p" 2>/dev/null | cut -d' ' -f1);; esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$t" "$s" "$o" "$m" "$p" "$h"
done
exit 0
