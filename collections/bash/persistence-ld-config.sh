NAME='Persistence - Library Loader Configuration'
DESCRIPTION='/etc/ld.so.preload, ld.so.conf and the library paths. A library listed in ld.so.preload is injected into every program, which is how user-space rootkits hide.'
DEPENDENCIES=()
TAGS=(persistence rootkit defense-evasion)

printf 'Source\tEntry\n'
[ -e /etc/ld.so.preload ] && { printf 'ld.so.preload exists\tyes (%s bytes)\n' "$(stat -c %s /etc/ld.so.preload)"; grep -vE '^\s*(#|$)' /etc/ld.so.preload 2>/dev/null | while IFS= read -r l; do printf 'ld.so.preload\t%s\n' "$l"; done; } || printf 'ld.so.preload exists\tno\n'
for f in /etc/ld.so.conf /etc/ld.so.conf.d/*.conf; do [ -r "$f" ] && grep -vE '^\s*(#|$)' "$f" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
printf 'LD_PRELOAD in this environment\t%s\n' "${LD_PRELOAD:-}"
printf 'LD_LIBRARY_PATH in this environment\t%s\n' "${LD_LIBRARY_PATH:-}"
exit 0
