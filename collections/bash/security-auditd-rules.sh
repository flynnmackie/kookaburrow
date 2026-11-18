NAME='Security - Auditd Rules and Status'
DESCRIPTION='Whether auditd is running and the audit rules loaded. No audit rules, or rules that were deleted, mean exec and file access go unrecorded.'
DEPENDENCIES=()
TAGS=(security defense-evasion logs)

printf 'Item\tValue\n'
printf 'auditd active\t%s\n' "$(systemctl is-active auditd 2>/dev/null </dev/null | head -n 1)"
printf 'auditctl status\t%s\n' "$(auditctl -s 2>/dev/null </dev/null | tr '\n' ' ')"
auditctl -l 2>/dev/null </dev/null | while IFS= read -r l; do printf 'loaded rule\t%s\n' "$l"; done
for f in /etc/audit/audit.rules /etc/audit/rules.d/*.rules; do [ -r "$f" ] && printf 'rules file\t%s (%s, %s lines)\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)" "$(grep -cvE '^\s*(#|$)' "$f")"; done
exit 0
