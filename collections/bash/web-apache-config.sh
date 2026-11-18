NAME='Web - Apache Virtual Hosts and Modules'
DESCRIPTION='Apache virtual hosts (names, ports, document roots), enabled modules and directives that weaken security (ServerTokens, TraceEnable, Options Indexes).'
DEPENDENCIES=()
TAGS=(web inventory)

printf 'Kind\tValue\n'
cmd=$(command -v apache2ctl || command -v apachectl || command -v httpd)
[ -n "$cmd" ] && { $cmd -S 2>&1 </dev/null | grep -E 'port|namevhost|alias' | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'vhost\t%s\n' "$l"; done; $cmd -M 2>&1 </dev/null | grep -E '_module' | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'module\t%s\n' "$l"; done; }
grep -rhE '^\s*(ServerTokens|TraceEnable|ServerSignature|Options .*Indexes|SSLProtocol|AllowOverride)' /etc/apache2 /etc/httpd 2>/dev/null | sed 's/^\s*//;s/\s\+/ /g' | sort | uniq -c | sort -rn | head -n 30 | while IFS= read -r l; do printf 'directive\t%s\n' "$l"; done
exit 0
