NAME='Cron - All Jobs'
DESCRIPTION='Every scheduled job: the system crontab and cron.d, the hourly, daily, weekly and monthly folders, every user crontab, anacron, at jobs and active systemd timers, each with the file modification time. Jobs that fetch and run remote content (curl, wget, base64, bash -i, nc) are marked with a leading !!. Needs root, or an account with passwordless sudo, to read user crontabs.'
DEPENDENCIES=()
TAGS=(persistence cron execution)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
sus='curl|wget|base64|/dev/tcp|nc |ncat|bash -i|python.*-c|perl.*-e|chmod \+x|/tmp/|/dev/shm'
show() { while IFS= read -r l; do if echo "$l" | grep -qE "$sus"; then echo "!! $l"; else echo "   $l"; fi; done; }
echo "== System crontab and cron.d =="
for f in /etc/crontab /etc/cron.d/* /etc/anacrontab; do [ -f "$f" ] || continue; echo "-- $f ($(stat -c %y "$f" | cut -d. -f1))"; grep -vE '^\s*(#|$)' "$f" | show; done
echo "== cron.hourly/daily/weekly/monthly =="
for d in /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly; do ls -l --time-style=long-iso "$d" 2>/dev/null | tail -n +2; done
echo "== User crontabs =="
for d in /var/spool/cron /var/spool/cron/crontabs; do
  for f in $($SUDO ls "$d" 2>/dev/null); do echo "-- user $f"; $SUDO cat "$d/$f" 2>/dev/null | grep -vE '^\s*(#|$)' | show; done
done
echo "== at jobs =="; $SUDO atq 2>/dev/null
echo "== systemd timers =="; systemctl list-timers --all --no-pager 2>/dev/null
exit 0
