NAME='Kernel - Modules and Preload'
DESCRIPTION='Checks for rootkit style persistence: loaded kernel modules, the kernel taint flag, /etc/ld.so.preload and LD_PRELOAD set in running processes. Preloaded libraries and unknown modules can hide files, processes and connections.'
DEPENDENCIES=()
TAGS=(persistence rootkit defense-evasion)

echo '== Kernel taint flag (0 is clean; non-zero can mean out-of-tree or unsigned modules) =='
cat /proc/sys/kernel/tainted 2>/dev/null
echo
echo '== Loaded kernel modules =='
lsmod 2>/dev/null | sort
echo
echo '== Modules loaded at boot =='
cat /etc/modules 2>/dev/null | grep -Ev '^\s*(#|$)'
cat /etc/modules-load.d/*.conf /usr/lib/modules-load.d/*.conf 2>/dev/null | grep -Ev '^\s*(#|$)'
echo
echo '== /etc/ld.so.preload (should normally not exist) =='
if [ -e /etc/ld.so.preload ]; then ls -l /etc/ld.so.preload; cat /etc/ld.so.preload; else echo '(not present)'; fi
echo
echo '== Processes with LD_PRELOAD or LD_LIBRARY_PATH in their environment (root needed) =='
found=0
for p in /proc/[0-9]*; do
  if tr '\0' '\n' 2>/dev/null < "$p/environ" | grep -qE '^(LD_PRELOAD|LD_LIBRARY_PATH)='; then
    echo "pid ${p#/proc/} ($(tr '\0' ' ' 2>/dev/null < "$p/cmdline" | cut -c1-100)): $(tr '\0' '\n' 2>/dev/null < "$p/environ" | grep -E '^(LD_PRELOAD|LD_LIBRARY_PATH)=' | tr '\n' ' ')"
    found=1
  fi
done
[ "$found" -eq 0 ] && echo '(none found, or /proc/*/environ not readable)'
exit 0
