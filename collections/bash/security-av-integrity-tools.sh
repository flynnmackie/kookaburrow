NAME='Security - Antivirus and Integrity Tools'
DESCRIPTION='ClamAV, rkhunter, chkrootkit, AIDE, Tripwire, OSSEC and Lynis: installed, last signature or database update, and last scan. Shows whether anything watches the host.'
DEPENDENCIES=()
TAGS=(security inventory)

printf 'Tool\tInstalled\tDetail\n'
for t in clamscan freshclam rkhunter chkrootkit aide tripwire lynis ossec-control debsums unhide; do p=$(command -v "$t" 2>/dev/null); printf '%s\t%s\t%s\n' "$t" "$([ -n "$p" ] && echo yes || echo no)" "$p"; done
for f in /var/lib/clamav/daily.cld /var/lib/clamav/daily.cvd /var/lib/aide/aide.db /var/lib/aide/aide.db.gz /var/lib/rkhunter/db/rkhunter.dat /var/log/rkhunter.log /var/log/lynis-report.dat /var/log/clamav/clamav.log; do [ -e "$f" ] && printf 'database or log\tpresent\t%s updated %s\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"; done
exit 0
