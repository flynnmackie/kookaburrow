NAME='Files - Recently Changed'
DESCRIPTION='Files created or changed in the last N minutes under a folder (default the whole file system, skipping /proc, /sys, /dev and /run), newest first, with owner, size and path. MINUTES defaults to 60. EXCLUDE is an optional text that paths must not contain. The quick way to see what an attacker touched just now. Needs root, or an account with passwordless sudo, to see every folder.'
DEPENDENCIES=()
PARAMETERS=(MINUTES? SEARCH_PATH? EXCLUDE? MAX_RESULTS?)
TAGS=(filesystem forensics discovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
MIN=${MINUTES:-60}; case "$MIN" in ''|*[!0-9]*) MIN=60;; esac
M=${MAX_RESULTS:-2000}; case "$M" in ''|*[!0-9]*) M=2000;; esac
ROOT=${SEARCH_PATH:-/}
echo "modified	changed	size	owner	mode	path"
$SUDO find "$ROOT" -xdev \( -path /proc -o -path /sys -o -path /dev -o -path /run \) -prune -o -type f \( -mmin "-$MIN" -o -cmin "-$MIN" \) \
  -printf '%TY-%Tm-%Td %TH:%TM:%TS\t%CY-%Cm-%Cd %CH:%CM\t%s\t%u\t%m\t%p\n' 2>/dev/null | { if [ -n "$EXCLUDE" ]; then grep -vF -- "$EXCLUDE"; else cat; fi; } | sort -r | head -n "$M"
exit 0
