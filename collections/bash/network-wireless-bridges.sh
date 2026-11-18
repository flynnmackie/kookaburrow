NAME='Network - Wireless, Bridges and Virtual Interfaces'
DESCRIPTION='Wireless interfaces, bridges, bonds, VLANs, tunnels and virtual interfaces. Unexpected tunnels and bridges can exfiltrate or pivot.'
DEPENDENCIES=()
TAGS=(network discovery)

printf 'Interface\tType\tState\tAddress\n'
if command -v ip >/dev/null 2>&1; then ip -o link show 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {n=$2; sub(/:$/,"",n); t="ethernet"; if(n~/^(wl|wlan)/) t="wireless"; else if(n~/^(br|virbr|docker|cni|flannel)/) t="bridge"; else if(n~/^(tun|tap|wg|ppp|vpn|tailscale|zt)/) t="tunnel/vpn"; else if(n~/^(veth|vnet)/) t="virtual"; else if(n~/^(bond)/) t="bond"; else if(n~/\./) t="vlan"; else if(n=="lo") t="loopback"; s=""; for(i=1;i<=NF;i++) if($i=="state") s=$(i+1); m=""; for(i=1;i<=NF;i++) if($i ~ /link\/ether/) m=$(i+1); print n,t,s,m}'; fi
exit 0
