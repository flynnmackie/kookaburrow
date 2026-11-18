NAME='Files - Core Dumps and Crash Reports'
DESCRIPTION='Core dump files and crash reports on disk and systemd-coredump entries. Crashes of security tools or services can show exploitation, and dumps can hold credentials.'
DEPENDENCIES=()
TAGS=(forensics filesystem)

printf 'Kind\tPath\tSize\tModified\n'
for d in /var/crash /var/lib/systemd/coredump /var/lib/apport/coredump /var/spool/abrt /tmp /var/tmp /; do [ -d "$d" ] && find "$d" -maxdepth 2 -xdev -type f \( -name 'core' -o -name 'core.*' -o -name '*.crash' -o -name 'core-*' \) -printf 'dump\t%p\t%s\t%TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | head -n 50; done
command -v coredumpctl >/dev/null 2>&1 && coredumpctl list --no-pager --no-legend 2>/dev/null </dev/null | tail -n 30 | while IFS= read -r l; do printf 'coredumpctl\t%s\t\t\n' "$(echo "$l" | sed 's/\s\+/ /g' | cut -c1-200)"; done
exit 0
