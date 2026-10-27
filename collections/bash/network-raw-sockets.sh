NAME='Network - Raw and Packet Sockets'
DESCRIPTION='Programs that sniff or craft network traffic. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(network c2 rootkit malware)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Raw sockets (ss -w) =="; $SUDO ss -wapn 2>/dev/null
echo "== Packet sockets (pid, process) =="
$SUDO ss -0apn 2>/dev/null || cat /proc/net/packet 2>/dev/null
echo "== Promiscuous interfaces =="; ip -d link 2>/dev/null | grep -iB1 promisc | grep -E '^[0-9]+:'
echo "== /proc/net/raw and /proc/net/packet =="; cat /proc/net/raw 2>/dev/null | head -n 20; cat /proc/net/packet 2>/dev/null | head -n 20
echo "== Capture and tunnel tools running =="
ps -eo pid,user,args 2>/dev/null | grep -iE 'tcpdump|tshark|wireshark|dumpcap|ettercap|nmap|masscan|zmap|scapy|hping|ptunnel|icmpsh|dnscat|iodine|chisel|socat|ncat|netcat|frp|ligolo' | grep -v grep
exit 0
