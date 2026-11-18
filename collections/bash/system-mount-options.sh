NAME='System - Mount Options (noexec, nosuid)'
DESCRIPTION='Mount options of /tmp, /var/tmp, /dev/shm, /home and /var: whether noexec, nosuid and nodev are set. A temp folder that allows execution is where malware runs from.'
DEPENDENCIES=()
TAGS=(security system filesystem)

printf 'Mount\tDevice\tType\tNoexec\tNosuid\tNodev\tOptions\n'
for m in /tmp /var/tmp /dev/shm /home /var /boot /run; do awk -v m="$m" 'BEGIN{OFS="\t"} $2==m {o=","$4","; print m,$1,$3,(o ~ /,noexec,/?"yes":"no"),(o ~ /,nosuid,/?"yes":"no"),(o ~ /,nodev,/?"yes":"no"),$4}' /proc/mounts 2>/dev/null; done
exit 0
