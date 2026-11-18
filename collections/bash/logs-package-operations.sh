NAME='Logs - Package Installs and Removals'
DESCRIPTION='What was installed, upgraded and removed and when, from dpkg, apt and yum history. New tools appearing outside change windows are a finding.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(packages forensics)

D=${DAYS:-14}; case "$D" in ''|*[!0-9]*) D=14;; esac
printf 'Time\tAction\tPackage\n'
if ls /var/log/dpkg.log* >/dev/null 2>&1; then cut_date=$(date -d "$D days ago" +%Y-%m-%d 2>/dev/null); for f in /var/log/dpkg.log*; do case "$f" in *.gz) zcat "$f" 2>/dev/null </dev/null;; *) cat "$f" 2>/dev/null;; esac; done | awk -v c="$cut_date" 'BEGIN{OFS="\t"} $3 ~ /^(install|upgrade|remove|purge)$/ && $1 >= c {print $1" "$2,$3,$4" "$5}' | sort | tail -n 500
elif [ -r /var/log/yum.log ]; then tail -n 500 /var/log/yum.log | awk 'BEGIN{OFS="\t"} {print $1" "$2" "$3,$4,$5}'
elif command -v dnf >/dev/null 2>&1; then dnf history list 2>/dev/null </dev/null | tail -n 40 | awk -F'|' 'BEGIN{OFS="\t"} NR>2 {print $3,$4,$2}'; fi
exit 0
