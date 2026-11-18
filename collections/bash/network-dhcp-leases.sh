NAME='Network - DHCP Leases'
DESCRIPTION='DHCP leases the host holds, with server and times, from NetworkManager, dhclient and systemd-networkd. A rogue DHCP server hands out hostile settings.'
DEPENDENCIES=()
TAGS=(network discovery)

printf 'File\tLine\n'
for f in /var/lib/dhcp/dhclient*.leases /var/lib/NetworkManager/*.lease /var/lib/dhclient/*.leases /run/systemd/netif/leases/*; do [ -r "$f" ] && grep -E 'interface|fixed-address|option (routers|domain-name-servers|dhcp-server-identifier)|ADDRESS=|SERVER_ADDRESS=|ROUTER=|DNS=' "$f" 2>/dev/null | sed 's/\s\+/ /g;s/^ //' | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
exit 0
