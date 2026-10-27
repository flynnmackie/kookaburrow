NAME='Logs - Auth Failures'
DESCRIPTION='Summary of authentication activity over the last N days (DAYS, default 7). Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(brute-force logons accounts event-logs)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
tmp=$(mktemp)
if ls /var/log/auth.log /var/log/secure >/dev/null 2>&1; then
  for f in /var/log/auth.log /var/log/auth.log.1 /var/log/secure /var/log/secure-*; do [ -f "$f" ] && $SUDO cat "$f" 2>/dev/null; done > "$tmp"
  find /var/log -maxdepth 1 \( -name 'auth.log.*.gz' -o -name 'secure-*.gz' \) -mtime "-$D" 2>/dev/null | while read -r z; do $SUDO zcat "$z" 2>/dev/null; done >> "$tmp"
else
  $SUDO journalctl --no-pager -o short-iso --since "$D days ago" _COMM=sshd _COMM=sudo _COMM=su 2>/dev/null > "$tmp"
fi
echo "== Failed SSH logins by source address (count, address) =="
grep -E 'Failed (password|publickey)|Invalid user|authentication failure' "$tmp" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | sort | uniq -c | sort -rn | head -n 30
echo "== Failed SSH logins by account (count, account) =="
grep -E 'Failed (password|publickey) for' "$tmp" | sed -E 's/.*Failed (password|publickey) for (invalid user )?([^ ]+) from.*/\3/' | sort | uniq -c | sort -rn | head -n 30
echo "== Invalid user names tried (count, name) =="
grep 'Invalid user' "$tmp" | sed -E 's/.*Invalid user ([^ ]*) from.*/\1/' | sort | uniq -c | sort -rn | head -n 30
echo "== Successful SSH logins (time, method, account, source) =="
grep -E 'Accepted (password|publickey|keyboard-interactive)' "$tmp" | sed -E 's/^(.{15,32}) [^ ]+ sshd\[[0-9]+\]: Accepted ([a-z-]+) for ([^ ]+) from ([^ ]+).*/\1\t\2\t\3\t\4/' | tail -n 100
echo "== Failed sudo attempts =="
grep -E 'sudo.*(authentication failure|incorrect password|NOT in sudoers)' "$tmp" | tail -n 50
rm -f "$tmp"
exit 0
