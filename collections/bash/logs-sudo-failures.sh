NAME='Logs - Sudo and Su Failures'
DESCRIPTION='Failed sudo attempts and su failures: who tried to become root, from which terminal, and the command. Repeated failures can be an attacker guessing a password.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(logons privilege-escalation forensics)

D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
for f in /var/log/auth.log /var/log/secure; do [ -r "$f" ] && grep -E 'sudo.*(authentication failure|incorrect password|NOT in sudoers|command not allowed)|su(\[[0-9]+\])?: .*(FAILED|authentication failure)' "$f" 2>/dev/null | tail -n 300; done
command -v journalctl >/dev/null 2>&1 && journalctl _COMM=sudo _COMM=su --since "$D days ago" --no-pager -o short-iso 2>/dev/null </dev/null | grep -E 'authentication failure|incorrect password|NOT in sudoers|FAILED' | tail -n 300
exit 0
