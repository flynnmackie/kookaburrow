NAME='Logs - Audit Search'
DESCRIPTION='Searches the Linux audit log (auditd) with ausearch: AUDIT_SINCE is recent, today, yesterday, this-week or a date and time such as "10/22/2026 08:00:00" (default today); MESSAGE_TYPE limits to a record type such as EXECVE, USER_LOGIN, USER_AUTH, USER_CMD, SYSCALL, ADD_USER or ANOM_ABEND; AUDIT_KEY to a rule key; CONTAINS to text anywhere in the record. Needs auditd to be installed and running, and root, or an account with passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(AUDIT_SINCE? MESSAGE_TYPE? AUDIT_KEY? CONTAINS? MAX_LINES?)
TAGS=(event-logs forensics execution accounts)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v ausearch >/dev/null 2>&1 || { echo "ausearch is not installed (auditd is not present on this host)" >&2; exit 1; }
M=${MAX_LINES:-3000}; case "$M" in ''|*[!0-9]*) M=3000;; esac
args=(-i -ts "${AUDIT_SINCE:-today}")
[ -n "$MESSAGE_TYPE" ] && args+=(-m "$MESSAGE_TYPE")
[ -n "$AUDIT_KEY" ] && args+=(-k "$AUDIT_KEY")
$SUDO ausearch "${args[@]}" 2>&1 | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | tail -n "$M"
exit 0
