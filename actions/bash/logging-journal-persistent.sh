NAME='Logging - Make Journal Persistent'
DESCRIPTION='Makes the systemd journal survive reboots by creating /var/log/journal and restarting journald, so logs are no longer lost when the host restarts.'
DEPENDENCIES=()
TAGS=(hardening event-logs)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v journalctl >/dev/null 2>&1 || { echo "systemd-journald is not present" >&2; exit 1; }
$SUDO mkdir -p /var/log/journal
$SUDO systemd-tmpfiles --create --prefix /var/log/journal 2>/dev/null
$SUDO systemctl restart systemd-journald && echo "journald restarted"
$SUDO journalctl --flush 2>/dev/null
echo "Journal storage: $($SUDO journalctl --disk-usage 2>/dev/null)"
ls -d /var/log/journal/* 2>/dev/null | head -n 2
exit 0
