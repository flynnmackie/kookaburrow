NAME='Network - UDP Sockets and Listeners'
DESCRIPTION='UDP sockets with the owning process, including unusual high ports. Used for DNS tunnelling, covert channels and discovery protocols.'
DEPENDENCIES=()
TAGS=(network c2 discovery)

printf 'Local\tPeer\tPid\tProcess\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S ss -unapH 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {pid=""; proc=""; if (match($0,/pid=[0-9]+/)) pid=substr($0,RSTART+4,RLENGTH-4); if (match($0,/\(\("[^"]+"/)) proc=substr($0,RSTART+3,RLENGTH-4); print $4,$5,pid,proc}'
exit 0
