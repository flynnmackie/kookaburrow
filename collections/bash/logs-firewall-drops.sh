NAME='Logs - Firewall Drops and Blocks'
DESCRIPTION='Packets the firewall blocked (UFW BLOCK, iptables DROP and REJECT log lines): source, destination and port counts. Port scans and blocked outbound connections stand out.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(network forensics)

D=${DAYS:-2}; case "$D" in ''|*[!0-9]*) D=2;; esac
printf 'Count\tSource\tDestination\tProto\tPort\n'
{ for f in /var/log/ufw.log /var/log/kern.log /var/log/messages /var/log/syslog; do [ -r "$f" ] && grep -E 'UFW BLOCK|IN=.*OUT=.*SRC=|DROP|REJECT' "$f" 2>/dev/null | tail -n 5000; done; command -v journalctl >/dev/null 2>&1 && journalctl -k --since "$D days ago" --no-pager 2>/dev/null </dev/null | grep -E 'SRC=.*DST='; } | awk 'BEGIN{OFS="\t"} {s="";d="";p="";dp=""; for(i=1;i<=NF;i++){ if($i ~ /^SRC=/) s=substr($i,5); if($i ~ /^DST=/) d=substr($i,5); if($i ~ /^PROTO=/) p=substr($i,7); if($i ~ /^DPT=/) dp=substr($i,5)} if(s!="") c[s OFS d OFS p OFS dp]++} END{for(k in c) print c[k] OFS k}' | sort -rn | head -n 100
exit 0
