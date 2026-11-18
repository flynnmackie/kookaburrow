NAME='Logs - Failed and Restarting Services'
DESCRIPTION='Systemd units in a failed state and units that restarted often. Crashing services can mean an exploit, a broken agent or a tampered binary.'
DEPENDENCIES=()
TAGS=(system forensics systemd)

printf 'Unit\tState\tDetail\n'
command -v systemctl >/dev/null 2>&1 && { systemctl --failed --no-pager --no-legend --plain 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {print $1,"failed",$2" "$3" "$4}'; for u in $(systemctl list-units --type=service --state=running --no-legend --plain --no-pager 2>/dev/null </dev/null | awk '{print $1}'); do n=$(systemctl show "$u" -p NRestarts --value 2>/dev/null </dev/null); [ -n "$n" ] && [ "$n" -gt 2 ] 2>/dev/null && printf '%s\trestarted\t%s times\n' "$u" "$n"; done; }
exit 0
