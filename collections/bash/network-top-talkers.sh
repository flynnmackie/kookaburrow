NAME='Network - Remote Addresses by Connection Count'
DESCRIPTION='Remote addresses ranked by the number of established connections, with the programs that hold them. A single address with many connections can be a scanner, a proxy or exfiltration.'
DEPENDENCIES=()
TAGS=(network c2 lateral-movement)

printf 'Remote\tConnections\tPrograms\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
$S ss -tnpH state established 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {split($4,a,":"); r=$4; sub(/:[0-9]+$/,"",r); pr=""; if (match($0,/\(\("[^"]+"/)) pr=substr($0,RSTART+3,RLENGTH-4); c[r]++; if (index(p[r],pr)==0) p[r]=p[r] " " pr} END{for(k in c) print k,c[k],p[k]}' | sort -t"$(printf '\t')" -k2 -rn | head -n 40
exit 0
