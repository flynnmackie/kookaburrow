NAME='Network - Services Listening on All Interfaces'
DESCRIPTION='Services bound to all addresses (0.0.0.0 and ::) as opposed to localhost only, with the program. These are reachable from the network and form the attack surface.'
DEPENDENCIES=()
TAGS=(network security inventory)

printf 'Port\tProto\tAddress\tProcess\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S ss -tulnpH 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {a=$5; p=a; sub(/^.*:/,"",p); h=a; sub(/:[0-9]+$/,"",h); if (h=="0.0.0.0"||h=="*"||h=="[::]"||h=="::") { pr=""; if (match($0,/\(\("[^"]+"/)) pr=substr($0,RSTART+3,RLENGTH-4); print p,$1,h,pr }}' | sort -u -n
exit 0
