NAME='Network - DNS and Name Resolution'
DESCRIPTION='Configured DNS servers, search domains, nsswitch order and the entries in /etc/hosts. Changed resolvers and hosts entries redirect traffic and hide C2.'
DEPENDENCIES=()
TAGS=(network dns c2)

printf 'Source\tEntry\n'
for f in /etc/resolv.conf /etc/nsswitch.conf; do [ -r "$f" ] && grep -E '^(nameserver|search|domain|options|hosts:)' "$f" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
grep -vE '^\s*(#|$)' /etc/hosts 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf '/etc/hosts\t%s\n' "$l"; done
command -v resolvectl >/dev/null 2>&1 && resolvectl dns 2>/dev/null </dev/null | while IFS= read -r l; do printf 'resolvectl\t%s\n' "$l"; done
exit 0
