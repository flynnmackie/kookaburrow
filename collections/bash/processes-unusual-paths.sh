NAME='Processes - Running From Unusual Paths'
DESCRIPTION='Processes whose program is in /tmp, /dev/shm, /var/tmp, a hidden folder or a home directory, or whose file was deleted. Malware often runs from these places.'
DEPENDENCIES=()
TAGS=(processes malware execution)

printf 'Pid\tUser\tExe\tDeleted\tCommand\n'
for p in /proc/[0-9]*; do pid=${p#/proc/}; exe=$(readlink "$p/exe" 2>/dev/null) || continue; [ -z "$exe" ] && continue; del=no; case "$exe" in *" (deleted)") del=yes;; esac
  case "$exe" in /tmp/*|/dev/shm/*|/var/tmp/*|/run/shm/*|/home/*|/root/*|*/.*|/memfd:*) :;; *) [ "$del" = no ] && continue;; esac
  printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$(stat -c %U "$p" 2>/dev/null)" "$exe" "$del" "$(tr '\0' ' ' < "$p/cmdline" 2>/dev/null | cut -c1-200)"; done
exit 0
