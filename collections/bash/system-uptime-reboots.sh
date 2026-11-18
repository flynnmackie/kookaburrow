NAME='System - Uptime and Reboot History'
DESCRIPTION='Time since the last boot, the boot id and the recorded reboots and shutdowns from wtmp. Unexpected reboots can mark a kernel change or an intrusion.'
DEPENDENCIES=()
TAGS=(system forensics)

printf 'Item\tValue\n'
printf 'Uptime\t%s\n' "$(uptime -p 2>/dev/null || cut -d. -f1 /proc/uptime)"
printf 'Boot time\t%s\n' "$(who -b 2>/dev/null | sed 's/^ *system boot *//')"
printf 'Boot id\t%s\n' "$(cat /proc/sys/kernel/random/boot_id 2>/dev/null)"
last -x -F reboot shutdown 2>/dev/null | head -n 20 | sed 's/  */ /g' | while IFS= read -r l; do [ -n "$l" ] && printf 'Reboot record\t%s\n' "$l"; done
exit 0
