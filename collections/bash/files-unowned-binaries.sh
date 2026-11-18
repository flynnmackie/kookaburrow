NAME='Files - Programs Not Owned by Any Package'
DESCRIPTION='Executables in the system program folders that no package manager knows about (dpkg or rpm). Planted programs and manual installs look like this.'
DEPENDENCIES=()
TAGS=(filesystem malware persistence)

printf 'Path\tModified\tOwner\tMode\n'
if command -v dpkg >/dev/null 2>&1; then
  for d in /usr/bin /usr/sbin /bin /sbin /usr/local/bin /usr/local/sbin /usr/lib/systemd/system /etc/systemd/system; do [ -d "$d" ] && find "$d" -maxdepth 1 -type f -printf '%p\t%TY-%Tm-%Td %TH:%TM\t%u\t%m\n' 2>/dev/null; done | while IFS="$(printf '\t')" read -r p t u m; do dpkg -S "$p" >/dev/null 2>&1 || printf '%s\t%s\t%s\t%s\n' "$p" "$t" "$u" "$m"; done | head -n 300
elif command -v rpm >/dev/null 2>&1; then
  for d in /usr/bin /usr/sbin /usr/local/bin /usr/local/sbin; do [ -d "$d" ] && find "$d" -maxdepth 1 -type f -printf '%p\t%TY-%Tm-%Td %TH:%TM\t%u\t%m\n' 2>/dev/null; done | while IFS="$(printf '\t')" read -r p t u m; do rpm -qf "$p" >/dev/null 2>&1 || printf '%s\t%s\t%s\t%s\n' "$p" "$t" "$u" "$m"; done | head -n 300
fi
exit 0
