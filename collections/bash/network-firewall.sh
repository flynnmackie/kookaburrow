NAME='Firewall - Rules'
DESCRIPTION='The active firewall rules from iptables, ip6tables, nftables, ufw and firewalld, whichever are present. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(network defense-evasion persistence)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== iptables =="; $SUDO iptables-save 2>/dev/null
echo "== ip6tables =="; $SUDO ip6tables-save 2>/dev/null
echo "== nftables =="; $SUDO nft list ruleset 2>/dev/null
echo "== ufw =="; $SUDO ufw status verbose 2>/dev/null
echo "== firewalld =="; $SUDO firewall-cmd --list-all-zones 2>/dev/null
echo "== forwarding =="; sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding 2>/dev/null
exit 0
