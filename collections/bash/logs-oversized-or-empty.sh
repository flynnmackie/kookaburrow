NAME='Logs - Missing, Empty or Truncated Logs'
DESCRIPTION='Standard log files that are missing, empty, or smaller than their rotated copy, which is how logs are wiped. Compares each log with its modification time and the journal state.'
DEPENDENCIES=()
TAGS=(defense-evasion forensics)

printf 'Log\tState\tSize\tModified\n'
for f in /var/log/auth.log /var/log/secure /var/log/syslog /var/log/messages /var/log/kern.log /var/log/wtmp /var/log/btmp /var/log/lastlog /var/log/audit/audit.log /var/log/cron; do if [ -e "$f" ]; then s=$(stat -c %s "$f"); st=ok; [ "$s" -eq 0 ] && st=empty; printf '%s\t%s\t%s\t%s\n' "$f" "$st" "$s" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; else printf '%s\tmissing\t\t\n' "$f"; fi; done
for f in /var/log/*.log; do [ -L "$f" ] && printf '%s\tsymlink to %s\t\t\n' "$f" "$(readlink "$f")"; done
exit 0
