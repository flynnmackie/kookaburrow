NAME='Security - Tools Present'
DESCRIPTION='What defends and watches this Linux host: auditd and its rules, fail2ban, ClamAV, AIDE, rkhunter, chkrootkit, osquery, Wazuh and OSSEC, and the running agents of common EDR products (CrowdStrike Falcon, SentinelOne, Carbon Black, Microsoft Defender for Endpoint, Sophos, Trend Micro, Elastic, Velociraptor), plus SELinux, AppArmor and the firewall state. Tells you what coverage exists, and which agent an attacker has stopped.'
DEPENDENCIES=()
TAGS=(inventory defense-evasion security)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Agents and services (running) =="
ps -eo pid,user,args 2>/dev/null | grep -iE 'falcon-sensor|falcond|cbagentd|cbdaemon|cbsensor|sentinelone|sentineld|s1-agent|mdatp|wdavdaemon|sophos|savd|ds_agent|trend|elastic-agent|elastic-endpoint|filebeat|auditbeat|wazuh|ossec|osqueryd|velociraptor|clamd|freshclam|fail2ban|auditd|aide|splunkd|ir_agent|tanium|qualys|nessus|rapid7|crowdstrike' | grep -v grep
echo "== systemd units for security tools =="
systemctl list-units --all --no-pager --no-legend 2>/dev/null | grep -iE 'falcon|crowdstrike|sentinel|mdatp|sophos|wazuh|ossec|osquery|auditd|fail2ban|clamav|clamd|aide|velociraptor|elastic|rkhunter|apparmor|selinux|ufw|firewalld|nftables|unattended' | awk '{print $1, $3, $4}'
echo "== auditd =="; command -v auditctl >/dev/null 2>&1 && { $SUDO auditctl -s 2>&1 | head -n 4; echo "rules loaded: $($SUDO auditctl -l 2>/dev/null | grep -vc 'No rules')"; } || echo "auditd is not installed"
echo "== Mandatory access control =="; echo "selinux: $(getenforce 2>/dev/null || echo not-present)"; echo "apparmor profiles: $($SUDO aa-status 2>/dev/null | head -n 2 | tr '\n' ' ')"
echo "== Firewall =="; command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>&1 | head -n 3; command -v firewall-cmd >/dev/null 2>&1 && $SUDO firewall-cmd --state 2>&1; echo "iptables rules: $($SUDO iptables -S 2>/dev/null | wc -l)"
echo "== Installed security packages =="
(dpkg -l 2>/dev/null || rpm -qa 2>/dev/null) | grep -iE 'auditd|fail2ban|clamav|aide|rkhunter|chkrootkit|osquery|wazuh|ossec|falcon|sentinel|mdatp|sophos|lynis|tripwire|unattended-upgrades|apparmor|selinux' | awk '{print $2, $3}' | head -n 40
exit 0
