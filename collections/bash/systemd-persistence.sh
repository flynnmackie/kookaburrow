NAME='Systemd - Persistence'
DESCRIPTION='Lists enabled services, systemd unit files created or changed in the last 30 days, timers, user-level units and legacy startup scripts (rc.local, init.d). New units are a common way to keep access on Linux.'
DEPENDENCIES=()
TAGS=(persistence systemd services)

echo '== Unit files in /etc/systemd/system changed in the last 30 days =='
find /etc/systemd/system -type f -mtime -30 -printf '%TY-%Tm-%Td %TH:%TM  %u  %p\n' 2>/dev/null | sort -r
echo
echo '== Unit files in other writable-by-admin locations changed in the last 30 days =='
find /usr/local/lib/systemd /run/systemd/system /lib/systemd/system /usr/lib/systemd/system -type f -mtime -30 -printf '%TY-%Tm-%Td %TH:%TM  %u  %p\n' 2>/dev/null | sort -r
echo
echo '== Enabled services =='
systemctl list-unit-files --type=service --state=enabled --no-pager 2>/dev/null || echo '(systemctl not available)'
echo
echo '== Timers =='
systemctl list-timers --all --no-pager 2>/dev/null
echo
echo '== Per-user systemd units =='
getent passwd | while IFS=: read -r user _ _ _ _ home _; do
  find "$home/.config/systemd/user" -type f 2>/dev/null | sed "s|^|$user: |"
done
echo
echo '== Legacy startup scripts =='
ls -l /etc/rc.local 2>/dev/null && grep -Ev '^\s*(#|$)' /etc/rc.local 2>/dev/null
find /etc/init.d -type f -mtime -30 -printf '%TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null
exit 0
