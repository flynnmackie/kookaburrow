NAME='Established connections and listeners'
DESCRIPTION='Lists established TCP connections and all listening sockets with the owning process, falling back to netstat when ss is missing. Run as root to see process names for every socket.'
DEPENDENCIES=()
TAGS=(network c2 lateral-movement listening)

if command -v ss >/dev/null 2>&1; then
  echo '== Established TCP connections =='
  ss -tnp state established 2>&1
  echo
  echo '== Listening sockets (TCP and UDP) =='
  ss -tulnp 2>&1
elif command -v netstat >/dev/null 2>&1; then
  echo '== Connections and listeners (netstat) =='
  netstat -tunap 2>&1
else
  echo '(neither ss nor netstat is installed)'
fi
echo
echo '== ARP / neighbour table =='
ip neigh 2>/dev/null || arp -an 2>/dev/null
