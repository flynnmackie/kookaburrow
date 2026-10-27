NAME='Persistence - Recent Config Changes'
DESCRIPTION='Files changed in the last N days in the places that matter for persistence and tampering.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(persistence forensics filesystem)

D=${DAYS:-7}
case "$D" in ''|*[!0-9]*) D=7;; esac
echo "== Changed in the last $D days (modified, size, path) =="
find /etc /usr/local /opt /root /home /var/spool/cron /var/spool/at /lib/systemd /usr/lib/systemd /srv /var/www -xdev -type f -mtime "-$D" \
  -not -path '*/.cache/*' -not -path '/home/*/.local/share/*' -not -name '*.log' -not -path '/etc/ssl/certs/*' 2>/dev/null \
  -printf '%TY-%Tm-%Td %TH:%TM\t%s\t%u\t%p\n' | sort -r | head -n 1500
echo "== New executables in binary folders =="
find /bin /sbin /usr/bin /usr/sbin /usr/local/bin /usr/local/sbin -type f -mtime "-$D" -printf '%TY-%Tm-%Td %TH:%TM\t%s\t%u\t%p\n' 2>/dev/null | sort -r | head -n 200
exit 0
