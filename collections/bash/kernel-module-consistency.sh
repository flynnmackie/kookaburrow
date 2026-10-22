NAME='Kernel - Module Consistency'
DESCRIPTION='Looks for kernel modules that hide: modules visible in /sys/module but not in /proc/modules or lsmod (a hiding rootkit removes itself from the module list but not from sysfs), the kernel taint flags (an out-of-tree, unsigned or forced module taints the kernel), and loaded modules with no file on disk or outside /lib/modules. Needs root, or an account with passwordless sudo, for full detail.'
DEPENDENCIES=()
TAGS=(rootkit kernel malware defense-evasion)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Kernel taint =="
t=$(cat /proc/sys/kernel/tainted 2>/dev/null); echo "tainted value: $t"
for pair in 0:proprietary-module 1:forced-module 3:forced-unload 5:bad-page 7:oops 11:firmware-workaround 12:out-of-tree-module 13:unsigned-module 15:live-patched; do b=${pair%%:*}; [ $(( (${t:-0} >> b) & 1 )) -eq 1 ] && echo "taint bit $b set: ${pair#*:}"; done
echo "== In /sys/module but not in /proc/modules (possibly hidden) =="
for d in /sys/module/*/initstate; do m=$(basename "$(dirname "$d")"); grep -q "^$m " /proc/modules 2>/dev/null || echo "$m (initstate: $(cat "$d" 2>/dev/null))"; done
echo "== Loaded modules whose file is missing or outside /lib/modules =="
while read -r m rest; do
  f=$(modinfo -n "$m" 2>/dev/null)
  if [ -z "$f" ] || [ ! -e "$f" ]; then echo "$m: no module file found (built in memory only?)"; else case "$f" in /lib/modules/*|/usr/lib/modules/*) ;; *) echo "$m: $f";; esac; fi
done < /proc/modules
echo "== Out-of-tree or unsigned loaded modules =="
while read -r m rest; do
  [ -r "/sys/module/$m/taint" ] && tn=$(cat "/sys/module/$m/taint" 2>/dev/null) && [ -n "$tn" ] && echo "$m taint: $tn"
done < /proc/modules
exit 0
