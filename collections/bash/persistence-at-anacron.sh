NAME='Persistence - At Jobs and Anacron'
DESCRIPTION='Jobs queued with at and the anacron table. Less watched than cron, so used to hide recurring execution.'
DEPENDENCIES=()
TAGS=(persistence cron)

printf 'Source\tEntry\n'
command -v atq >/dev/null 2>&1 && atq 2>/dev/null </dev/null | while IFS= read -r l; do printf 'atq\t%s\n' "$l"; done
for d in /var/spool/at /var/spool/cron/atjobs; do [ -d "$d" ] && ls -l "$d" 2>/dev/null | tail -n +2 | while IFS= read -r l; do printf 'at spool %s\t%s\n' "$d" "$l"; done; done
[ -r /etc/anacrontab ] && grep -vE '^\s*(#|$)' /etc/anacrontab 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'anacrontab\t%s\n' "$l"; done
exit 0
