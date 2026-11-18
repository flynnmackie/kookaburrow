NAME='Processes - Orphans and Kernel Thread Impostors'
DESCRIPTION='Processes whose parent is init that normally would not be, and processes that name themselves like a kernel thread (in brackets) but have a real program file.'
DEPENDENCIES=()
TAGS=(processes defense-evasion rootkit)

printf 'Pid\tPpid\tName\tCommand\tReason\n'
for p in /proc/[0-9]*; do pid=${p#/proc/}; [ -r "$p/stat" ] || continue; comm=$(cat "$p/comm" 2>/dev/null); ppid=$(awk '{print $4}' "$p/stat" 2>/dev/null); exe=$(readlink "$p/exe" 2>/dev/null); cmd=$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null)
  case "$cmd" in "["*"]"*) [ -n "$exe" ] && printf '%s\t%s\t%s\t%s\tlooks like a kernel thread but has a program file\n' "$pid" "$ppid" "$comm" "$(echo "$cmd" | cut -c1-120)";; esac
  [ "$ppid" = 1 ] && [ -n "$exe" ] && case "$exe" in /tmp/*|/dev/shm/*|/var/tmp/*|/home/*|/root/*) printf '%s\t%s\t%s\t%s\tchild of init running from a writable path\n' "$pid" "$ppid" "$comm" "$(echo "$cmd" | cut -c1-120)";; esac; done
exit 0
