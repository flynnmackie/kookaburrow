NAME='Files - SUID and SGID Files Outside Standard Folders'
DESCRIPTION='Set-uid and set-gid files in places where none are expected (home, tmp, opt, srv, var, mnt). A planted SUID shell is a classic privilege escalation backdoor.'
DEPENDENCIES=()
TAGS=(filesystem privilege-escalation persistence)

printf 'Path\tMode\tOwner\tModified\tSize\n'
for d in /home /root /tmp /var/tmp /dev/shm /opt /srv /var /mnt /media /usr/local; do [ -d "$d" ] && find "$d" -xdev -type f \( -perm -4000 -o -perm -2000 \) ! -path '/var/lib/*' ! -path '/var/cache/*' -printf '%p\t%m\t%u\t%TY-%Tm-%Td %TH:%TM\t%s\n' 2>/dev/null | head -n 50; done
exit 0
