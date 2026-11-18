NAME='System - CPU and Memory'
DESCRIPTION='CPU model and count, total and available memory, swap and the load average. Helps spot cryptominers and resource exhaustion.'
DEPENDENCIES=()
TAGS=(inventory system)

printf 'Item\tValue\n'
printf 'CPU model\t%s\n' "$(awk -F: '/model name/{gsub(/^ /,"",$2); print $2; exit}' /proc/cpuinfo 2>/dev/null)"
printf 'CPU count\t%s\n' "$(grep -c '^processor' /proc/cpuinfo 2>/dev/null)"
for k in MemTotal MemAvailable SwapTotal SwapFree; do printf '%s\t%s\n' "$k" "$(awk -v k="$k:" '$1==k{print $2" kB"}' /proc/meminfo 2>/dev/null)"; done
printf 'Load average\t%s\n' "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
exit 0
