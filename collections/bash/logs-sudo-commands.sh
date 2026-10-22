NAME='Logs - Sudo and Su Commands'
DESCRIPTION='Commands run through sudo (user, working directory, target user and full command) and su or sudo sessions opened, over the last N days (DAYS, default 7). CONTAINS keeps lines containing that text, for example a command name or an account. Shows what an account did with elevated rights. Reads the auth log, the secure log or the journal. Needs root, or an account with passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(DAYS? CONTAINS?)
TAGS=(accounts privilege-escalation execution event-logs)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
{
  if ls /var/log/auth.log /var/log/secure >/dev/null 2>&1; then for f in /var/log/auth.log* /var/log/secure*; do case "$f" in *.gz) $SUDO zcat "$f" 2>/dev/null;; *) [ -f "$f" ] && $SUDO cat "$f" 2>/dev/null;; esac; done
  else $SUDO journalctl --no-pager -o short-iso --since "$D days ago" _COMM=sudo _COMM=su 2>/dev/null; fi
} | grep -E 'COMMAND=|session opened for user|session closed for user|su: \(to|pam_unix\(su' | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | tail -n 1500
exit 0
