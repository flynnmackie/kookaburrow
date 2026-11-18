NAME='System - Memory-Backed File Systems'
DESCRIPTION='tmpfs and ramfs mounts with their size and use, and the files held in /dev/shm. Data kept in memory never reaches the disk and is lost at reboot, so tools hide there.'
DEPENDENCIES=()
TAGS=(system defense-evasion filesystem)

printf 'Mount\tType\tSize\tUsed\tUse\n'
df -hPT -t tmpfs -t ramfs 2>/dev/null </dev/null | awk 'NR>1 {print $7"\t"$2"\t"$3"\t"$4"\t"$6}'
for f in /dev/shm/* /dev/shm/.[!.]*; do [ -e "$f" ] && printf '%s\tfile in /dev/shm\t%s\t%s\t%s\n' "$f" "$(stat -c %s "$f")" "$(stat -c %U "$f")" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; done
exit 0
