NAME='Processes - Deleted or Memory-Only Libraries'
DESCRIPTION='Processes that mapped a library or file that has since been deleted, or that run from an anonymous memory file (memfd). Fileless malware and replaced libraries show up here.'
DEPENDENCIES=()
TAGS=(processes malware defense-evasion)

printf 'Pid\tName\tMapping\n'
for p in /proc/[0-9]*; do pid=${p#/proc/}; [ -r "$p/maps" ] || continue
  grep -E '\(deleted\)|memfd:' "$p/maps" 2>/dev/null | awk '{print $6" "$7}' | sort -u | head -n 5 | while IFS= read -r m; do printf '%s\t%s\t%s\n' "$pid" "$(cat "$p/comm" 2>/dev/null)" "$m"; done; done | grep -vE '/dev/zero|/SYSV|/dev/shm/(pulse|\.com|sem\.)|/tmp/#|ld-linux|\.cache/|/var/lib/dpkg' | head -n 300
exit 0
