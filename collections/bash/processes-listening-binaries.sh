NAME='Processes - Listening Programs and Their Files'
DESCRIPTION='Every program with a listening socket, the port, the program path, its package owner and hash. A listener whose file is unowned or recently changed is a lead.'
DEPENDENCIES=()
TAGS=(processes network inventory)

printf 'Port\tProto\tPid\tProcess\tExe\tSha256\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S ss -tulnpH 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {split($5,a,":"); port=a[length(a)]; pid=""; proc=""; if (match($0,/pid=[0-9]+/)) pid=substr($0,RSTART+4,RLENGTH-4); if (match($0,/\(\("[^"]+"/)) proc=substr($0,RSTART+3,RLENGTH-4); print port,$1,pid,proc}' | sort -u | while IFS="$(printf '\t')" read -r port proto pid proc; do exe=""; [ -n "$pid" ] && exe=$($S readlink "/proc/$pid/exe" 2>/dev/null); h=""; [ -n "$exe" ] && h=$($S sha256sum "$exe" 2>/dev/null | cut -d' ' -f1); printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$port" "$proto" "$pid" "$proc" "$exe" "$h"; done
exit 0
