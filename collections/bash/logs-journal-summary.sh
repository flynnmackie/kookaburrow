NAME='Logs - Journal Health and Coverage'
DESCRIPTION='Journal disk usage, how many boots it holds, the time of the oldest entry and the retention settings. A journal that starts recently, or was vacuumed, can mean the history was wiped.'
DEPENDENCIES=()
TAGS=(logs defense-evasion forensics)

printf 'Item\tValue\n'
if command -v journalctl >/dev/null 2>&1; then printf 'Disk usage\t%s\n' "$(journalctl --disk-usage 2>/dev/null </dev/null | sed 's/Archived and active journals take up //;s/ in the file system.*//')"; printf 'Boots recorded\t%s\n' "$(journalctl --list-boots --no-pager 2>/dev/null </dev/null | wc -l)"; printf 'Oldest entry\t%s\n' "$(journalctl --no-pager -o short-iso -n 1 --reverse 2>/dev/null </dev/null | head -n1 | cut -c1-25)"; printf 'First entry\t%s\n' "$(journalctl --no-pager -o short-iso -n 1 2>/dev/null </dev/null | head -n1 | cut -c1-25)"; printf 'Verify\t%s\n' "$(journalctl --verify 2>&1 </dev/null | grep -ciE 'fail|corrupt')"; fi
grep -hE '^(Storage|SystemMaxUse|MaxRetentionSec|ForwardToSyslog|Seal)=' /etc/systemd/journald.conf /etc/systemd/journald.conf.d/*.conf 2>/dev/null | while IFS= read -r l; do printf 'journald.conf\t%s\n' "$l"; done
exit 0
