NAME='Network - Interfaces'
DESCRIPTION='Network configuration: interfaces and addresses, routing table, neighbour (ARP) cache, DNS resolvers and search domains, the hosts file and proxy environment. Shows unexpected tunnels, extra addresses, rogue DNS servers and entries added to hosts.'
DEPENDENCIES=()
TAGS=(network inventory dns)

echo "== Interfaces =="; ip -br addr 2>/dev/null || ifconfig -a 2>/dev/null
echo "== Links =="; ip -br link 2>/dev/null
echo "== Routes =="; ip route 2>/dev/null || netstat -rn 2>/dev/null
echo "== IPv6 routes =="; ip -6 route 2>/dev/null
echo "== Neighbours =="; ip neigh 2>/dev/null || arp -an 2>/dev/null
echo "== DNS resolvers =="; grep -v '^#' /etc/resolv.conf 2>/dev/null; resolvectl dns 2>/dev/null
echo "== /etc/hosts =="; grep -v '^#' /etc/hosts 2>/dev/null | grep -v '^$'
echo "== Proxy environment =="; env 2>/dev/null | grep -i proxy; grep -ri proxy /etc/environment /etc/apt/apt.conf.d 2>/dev/null | head -20
exit 0
