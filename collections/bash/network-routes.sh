NAME='Network - Routes and Gateways'
DESCRIPTION='The routing table (IPv4 and IPv6) and the default gateways. A new default route or a route through an odd gateway redirects traffic.'
DEPENDENCIES=()
TAGS=(network discovery)

printf 'Family\tRoute\n'
if command -v ip >/dev/null 2>&1; then ip -4 route show table all 2>/dev/null | grep -v '^broadcast\|^local' | while IFS= read -r l; do printf 'IPv4\t%s\n' "$l"; done; ip -6 route show table all 2>/dev/null | grep -v '^local\|^multicast\|fe80' | while IFS= read -r l; do printf 'IPv6\t%s\n' "$l"; done
else route -n 2>/dev/null </dev/null | tail -n +3 | while IFS= read -r l; do printf 'IPv4\t%s\n' "$l"; done; fi
exit 0
