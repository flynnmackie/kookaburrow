NAME='Files - Recently Created Programs'
DESCRIPTION='Executable files created or changed in the last days (default 7) in the system, local and web folders. New programs outside package updates need an explanation.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(filesystem execution forensics)

D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
printf 'Path\tModified\tSize\tOwner\tMode\tPackaged\n'
for d in /usr/bin /usr/sbin /usr/local /bin /sbin /opt /srv /var/www /root /home /tmp /var/tmp /dev/shm /etc/cron.d /etc/init.d; do [ -d "$d" ] && find "$d" -xdev -type f -perm /111 -mtime "-$D" -printf '%p\t%TY-%Tm-%Td %TH:%TM\t%s\t%u\t%m\n' 2>/dev/null | head -n 150; done | while IFS="$(printf '\t')" read -r p t s u m; do pk=no; command -v dpkg >/dev/null 2>&1 && dpkg -S "$p" >/dev/null 2>&1 && pk=yes; command -v rpm >/dev/null 2>&1 && rpm -qf "$p" >/dev/null 2>&1 && pk=yes; printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$p" "$t" "$s" "$u" "$m" "$pk"; done
exit 0
