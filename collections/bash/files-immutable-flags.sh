NAME='Files - Immutable and Append-Only Files'
DESCRIPTION='Files with the immutable or append-only attribute in system and temporary folders. Malware sets them so the file cannot be deleted or changed, even by root.'
DEPENDENCIES=()
TAGS=(filesystem defense-evasion rootkit)

printf 'Flags\tPath\n'
if command -v lsattr >/dev/null 2>&1; then for d in /etc /bin /sbin /usr/bin /usr/sbin /usr/local /root /tmp /var/tmp /var/spool /lib/systemd /home; do [ -d "$d" ] && lsattr -R "$d" 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} /^[-aAcCdDeEFhijImNPsStTuxX]+ / { if ($1 ~ /[ai]/) print $1,$2 }' | head -n 100; done; fi
exit 0
