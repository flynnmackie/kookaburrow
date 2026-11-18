NAME='Network - ARP and Neighbour Table'
DESCRIPTION='Hosts this machine has recently talked to on the local network, with their MAC addresses and state. Duplicate MACs can indicate ARP spoofing.'
DEPENDENCIES=()
TAGS=(network discovery lateral-movement)

printf 'Address\tDevice\tMac\tState\n'
if command -v ip >/dev/null 2>&1; then ip neigh show 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {mac=""; for(i=1;i<=NF;i++) if($i=="lladdr") mac=$(i+1); print $1,$3,mac,$NF}'; else arp -an 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {gsub(/[()]/,"",$2); print $2,$NF,$4,""}'; fi
exit 0
