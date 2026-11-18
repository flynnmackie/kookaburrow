NAME='Logs - Cron Job Executions'
DESCRIPTION='Jobs cron ran recently, from syslog or the journal: the user and command. A job you do not recognise that ran on schedule is persistence in action.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(persistence cron forensics)

D=${DAYS:-3}; case "$D" in ''|*[!0-9]*) D=3;; esac
for f in /var/log/syslog /var/log/cron /var/log/cron.log; do [ -r "$f" ] && grep -E 'CRON\[|CROND\[|crond\[' "$f" 2>/dev/null | grep -E 'CMD|run-parts|STARTUP' | tail -n 300; done
command -v journalctl >/dev/null 2>&1 && journalctl -t CRON -t CROND --since "$D days ago" --no-pager -o short-iso 2>/dev/null </dev/null | grep CMD | tail -n 300
exit 0
