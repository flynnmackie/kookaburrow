NAME='System - Resource Limits and Core Dumps'
DESCRIPTION='ulimit settings from limits.conf and the core dump pattern. Core dumps can hold credentials and are a way to take memory off a host.'
DEPENDENCIES=()
TAGS=(system security)

printf 'Setting\tValue\n'
printf 'core_pattern\t%s\n' "$(cat /proc/sys/kernel/core_pattern 2>/dev/null)"
printf 'suid_dumpable\t%s\n' "$(cat /proc/sys/fs/suid_dumpable 2>/dev/null)"
printf 'ulimit -c\t%s\n' "$(ulimit -c 2>/dev/null)"
for f in /etc/security/limits.conf /etc/security/limits.d/*.conf; do [ -r "$f" ] && grep -vE '^\s*(#|$)' "$f" 2>/dev/null | while IFS= read -r l; do printf 'limits (%s)\t%s\n' "$f" "$l"; done; done
exit 0
