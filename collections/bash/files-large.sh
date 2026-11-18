NAME='Files - Largest Files'
DESCRIPTION='The largest files in the home, temp, web and backup folders (default over 200 MB). Large archives and database dumps are what data theft is made of.'
DEPENDENCIES=()
PARAMETERS=(MINMB?)
TAGS=(filesystem exfiltration forensics)

M=${MINMB:-200}; case "$M" in ''|*[!0-9]*) M=200;; esac
printf 'Path\tSizeMB\tModified\tOwner\n'
for d in /home /root /tmp /var/tmp /srv /var/www /opt /var/backups /mnt /media; do [ -d "$d" ] && find "$d" -xdev -type f -size "+${M}M" -printf '%p\t%s\t%TY-%Tm-%Td %TH:%TM\t%u\n' 2>/dev/null | awk 'BEGIN{FS=OFS="\t"} {$2=int($2/1048576); print}' | head -n 50; done
exit 0
