NAME='Network - Established Connections With Programs'
DESCRIPTION='Every established TCP connection with local and remote address, the owning process and its program path. Shows who this host is talking to and which program does it.'
DEPENDENCIES=()
TAGS=(network c2 lateral-movement)

printf 'Local\tRemote\tState\tPid\tProcess\tExe\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S ss -tnpH state established 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {pid=""; proc=""; if (match($0,/pid=[0-9]+/)) pid=substr($0,RSTART+4,RLENGTH-4); if (match($0,/\(\("[^"]+"/)) proc=substr($0,RSTART+3,RLENGTH-4); print $3,$4,"ESTAB",pid,proc}' | while IFS="$(printf '\t')" read -r l r s pid proc; do exe=""; [ -n "$pid" ] && exe=$($S readlink "/proc/$pid/exe" 2>/dev/null); printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$l" "$r" "$s" "$pid" "$proc" "$exe"; done
exit 0
