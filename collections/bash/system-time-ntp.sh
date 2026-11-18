NAME='System - Time and NTP'
DESCRIPTION='Time zone, clock synchronisation state and the time servers in use. A host with a skewed or unsynchronised clock breaks log correlation.'
DEPENDENCIES=()
TAGS=(system inventory)

printf 'Item\tValue\n'
printf 'Date (UTC)\t%s\n' "$(date -u '+%Y-%m-%d %H:%M:%S')"
printf 'Time zone\t%s\n' "$(timedatectl show -p Timezone --value 2>/dev/null </dev/null || cat /etc/timezone 2>/dev/null)"
printf 'NTP synchronised\t%s\n' "$(timedatectl show -p NTPSynchronized --value 2>/dev/null </dev/null)"
printf 'NTP service\t%s\n' "$(timedatectl show -p NTP --value 2>/dev/null </dev/null)"
for f in /etc/chrony.conf /etc/chrony/chrony.conf /etc/ntp.conf /etc/systemd/timesyncd.conf; do [ -r "$f" ] && grep -E '^(server|pool|NTP=|FallbackNTP=)' "$f" 2>/dev/null | while IFS= read -r l; do printf 'Time source\t%s: %s\n' "$f" "$l"; done; done
exit 0
