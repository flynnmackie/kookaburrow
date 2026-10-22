NAME='System - Info'
DESCRIPTION='Host identity and build: hostname, distribution, kernel, architecture, uptime and last boot, time zone, CPU and memory, virtualisation, currently logged in users and the Linux security modules in use. The first thing to record about any Linux host.'
DEPENDENCIES=()
TAGS=(inventory discovery)

echo "== Host =="
echo "hostname: $(hostname -f 2>/dev/null || hostname)"
echo "kernel: $(uname -srvm)"
[ -r /etc/os-release ] && . /etc/os-release && echo "os: ${PRETTY_NAME:-$NAME} (${VERSION_ID:-})"
echo "uptime: $(uptime -p 2>/dev/null)"
echo "boot: $(who -b 2>/dev/null | sed 's/^ *//')"
echo "timezone: $(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null)  now: $(date '+%F %T %Z')"
echo "virtualisation: $(systemd-detect-virt 2>/dev/null || echo unknown)"
echo "cpu: $(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ *//') x$(nproc 2>/dev/null)"
echo "memory: $(awk '/MemTotal/ {printf "%.1f GB", $2/1048576}' /proc/meminfo)"
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"
echo "== Security modules =="
echo "selinux: $(getenforce 2>/dev/null || echo not-present)"
echo "apparmor: $(aa-status --enabled 2>/dev/null && echo enabled || echo not-enabled)"
echo "lockdown: $(cat /sys/kernel/security/lockdown 2>/dev/null)"
echo "secure boot: $(mokutil --sb-state 2>/dev/null | head -1)"
echo "== Logged in =="
who -a 2>/dev/null
exit 0
