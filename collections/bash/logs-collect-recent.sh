NAME='Logs - Collect Recent'
DESCRIPTION='Collects log files changed in the last N days. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(event-logs forensics filesystem)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-14}; case "$D" in ''|*[!0-9]*) D=14;; esac
list=$(mktemp)
$SUDO find /var/log -type f \( -mtime "-$D" -o -name wtmp -o -name btmp -o -name lastlog \) 2>/dev/null > "$list"
n=$(wc -l < "$list")
[ "$n" -gt 0 ] || { echo "no log files found" >&2; exit 1; }
$SUDO tar czf "$OUT_DIR/var-log-recent.tgz" -T "$list" 2>/dev/null
$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/var-log-recent.tgz" 2>/dev/null
if command -v journalctl >/dev/null 2>&1; then $SUDO journalctl --no-pager -o export --since "$D days ago" 2>/dev/null | gzip > "$OUT_DIR/journal-last-${D}-days.export.gz"; fi
rm -f "$list"
echo "log files archived: $n"
ls -l "$OUT_DIR" | tail -n +2
exit 0
