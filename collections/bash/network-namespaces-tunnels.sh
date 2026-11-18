NAME='Network - Namespaces, Tunnels and WireGuard'
DESCRIPTION='Network namespaces, IP tunnels (GRE, IPIP, SIT, VXLAN), WireGuard and OpenVPN configuration. Unexpected tunnels carry traffic that firewalls on the main interface never see.'
DEPENDENCIES=()
TAGS=(network c2 defense-evasion)

printf 'Kind\tDetail\n'
command -v ip >/dev/null 2>&1 && { ip netns list 2>/dev/null </dev/null | while IFS= read -r l; do printf 'netns\t%s\n' "$l"; done; ip -d link show 2>/dev/null </dev/null | grep -E 'gre|ipip|sit|vxlan|wireguard|geneve|tun|macvlan' | sed 's/\s\+/ /g' | cut -c1-200 | while IFS= read -r l; do printf 'link\t%s\n' "$l"; done; ip tunnel show 2>/dev/null </dev/null | while IFS= read -r l; do printf 'tunnel\t%s\n' "$l"; done; }
for f in /etc/wireguard/*.conf /etc/openvpn/*.conf /etc/openvpn/client/*.conf; do [ -r "$f" ] && printf 'vpn config\t%s (%s)\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"; done
exit 0
