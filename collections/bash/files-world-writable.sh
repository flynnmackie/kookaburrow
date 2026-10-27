NAME='Files - World Writable'
DESCRIPTION='Files and folders that any user can write to (excluding sticky-bit temp folders and /proc, /sys and /dev).'
DEPENDENCIES=()
PARAMETERS=(SEARCH_PATH?)
TAGS=(filesystem privilege-escalation persistence)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
R=${SEARCH_PATH:-/}
echo "== World-writable files =="
$SUDO find "$R" -xdev \( -path /proc -o -path /sys -o -path /dev -o -path /run \) -prune -o -type f -perm -0002 -printf '%TY-%Tm-%Td %TH:%TM\t%m\t%u\t%p\n' 2>/dev/null | head -n 500
echo "== World-writable folders without the sticky bit =="
$SUDO find "$R" -xdev \( -path /proc -o -path /sys -o -path /dev -o -path /run \) -prune -o -type d -perm -0002 ! -perm -1000 -printf '%TY-%Tm-%Td %TH:%TM\t%m\t%u\t%p\n' 2>/dev/null | head -n 300
exit 0
