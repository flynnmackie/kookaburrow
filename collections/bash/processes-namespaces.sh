NAME='Processes - Namespaces and Containers'
DESCRIPTION='Processes that run in a different mount, pid or network namespace from init, and whether they are in a container. Finds container processes and processes hiding in a namespace.'
DEPENDENCIES=()
TAGS=(processes containers defense-evasion)

printf 'Pid\tName\tMntNs\tPidNs\tNetNs\tDifferentFromInit\n'
im=$(readlink /proc/1/ns/mnt 2>/dev/null); ip=$(readlink /proc/1/ns/pid 2>/dev/null); in=$(readlink /proc/1/ns/net 2>/dev/null)
for p in /proc/[0-9]*; do pid=${p#/proc/}; m=$(readlink "$p/ns/mnt" 2>/dev/null) || continue; pn=$(readlink "$p/ns/pid" 2>/dev/null); n=$(readlink "$p/ns/net" 2>/dev/null)
  d=""; [ "$m" != "$im" ] && d="mnt "; [ "$pn" != "$ip" ] && d="${d}pid "; [ "$n" != "$in" ] && d="${d}net"
  [ -n "$d" ] && printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$(cat "$p/comm" 2>/dev/null)" "$m" "$pn" "$n" "$d"; done
exit 0
