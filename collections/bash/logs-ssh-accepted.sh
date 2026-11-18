NAME='Logs - SSH Logins Accepted'
DESCRIPTION='Successful SSH logins from the auth log or the journal: user, method, source address and time. Logins from new addresses or with passwords where keys are expected stand out.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(logons ssh forensics)

D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
if command -v journalctl >/dev/null 2>&1; then journalctl -u ssh -u sshd --since "$D days ago" --no-pager -o short-iso 2>/dev/null </dev/null | grep 'Accepted '; fi | head -n 500
for f in /var/log/auth.log /var/log/secure; do [ -r "$f" ] && grep 'Accepted ' "$f" 2>/dev/null | tail -n 500; done | head -n 500
exit 0
