NAME='Security - Fail2ban and Firewall Managers'
DESCRIPTION='Whether fail2ban, ufw, firewalld and nftables services are active and which jails ban what. Disabled protections and empty jail lists matter.'
DEPENDENCIES=()
TAGS=(security network)

printf 'Item\tState\n'
for s in fail2ban ufw firewalld nftables iptables netfilter-persistent; do command -v systemctl >/dev/null 2>&1 && printf '%s\t%s\n' "$s" "$(systemctl is-active "$s" 2>/dev/null </dev/null)"; done
command -v fail2ban-client >/dev/null 2>&1 && for j in $(fail2ban-client status 2>/dev/null </dev/null | awk -F: '/Jail list/{gsub(/,/," ",$2); print $2}'); do printf 'jail %s\t%s\n' "$j" "$(fail2ban-client status "$j" 2>/dev/null </dev/null | awk -F: '/Currently banned|Total banned/{gsub(/^\s+/,"",$2); printf "%s=%s ", $1,$2}')"; done
command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null </dev/null | head -n 1 | while IFS= read -r l; do printf 'ufw status\t%s\n' "$l"; done
exit 0
