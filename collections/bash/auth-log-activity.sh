NAME='Authentication log activity'
DESCRIPTION='Summarises SSH logins and sudo use from the authentication log (auth.log or secure, or journald): successful logins, failed attempts grouped by source address, and recent sudo commands. Run as root to read the logs.'
DEPENDENCIES=()
TAGS=(logons event-logs brute-force accounts)

log=
for f in /var/log/auth.log /var/log/secure; do
  [ -r "$f" ] && { log=$f; break; }
done

if [ -n "$log" ]; then
  src() { cat "$log"; }
  echo "Using $log"
elif command -v journalctl >/dev/null 2>&1; then
  src() { journalctl -u ssh -u sshd -t sudo --no-pager -n 20000 2>/dev/null; }
  echo 'Using journalctl'
else
  echo '(no readable authentication log: run as root)'
  exit 0
fi

echo
echo '== Last 30 successful logins =='
src | grep -E 'Accepted (password|publickey|keyboard-interactive)' | tail -n 30
echo
echo '== Failed attempts by source address =='
src | grep -E 'Failed password|Invalid user' | grep -oE 'from [0-9a-fA-F:.]+' | sort | uniq -c | sort -rn | head -n 20
echo
echo '== Users targeted by failed attempts =='
src | grep -E 'Failed password for|Invalid user' | sed -E 's/.*(Failed password for (invalid user )?|Invalid user )([^ ]+).*/\3/' | sort | uniq -c | sort -rn | head -n 20
echo
echo '== Last 30 sudo commands =='
src | grep -E 'sudo:.*COMMAND=' | tail -n 30
echo
echo '== New users and group changes =='
src | grep -E 'useradd|usermod|groupadd|new user|new group|added .* to group' | tail -n 30
