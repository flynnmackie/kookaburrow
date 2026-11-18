NAME='Logs - Root and Privileged Logins'
DESCRIPTION='Direct root logins, su to root and sessions opened for root in the auth log and wtmp. Direct root login over SSH should be rare and is worth an explanation.'
DEPENDENCIES=()
TAGS=(logons privilege-escalation forensics)

for f in /var/log/auth.log /var/log/secure; do [ -r "$f" ] && grep -E 'session opened for user root|Accepted .* for root|ROOT LOGIN|su(\[[0-9]+\])?: .*to root' "$f" 2>/dev/null | tail -n 200; done
last -F root 2>/dev/null </dev/null | head -n 30
exit 0
