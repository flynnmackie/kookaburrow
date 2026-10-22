NAME='Systemd - Services'
DESCRIPTION='All systemd service units with state and unit file path, then the ExecStart of every service that is not from a distribution package (units in /etc/systemd/system, /run/systemd and user unit folders) which is where attackers install persistence. Unit files modified in the last N days are listed with DAYS (default 14).'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(persistence systemd services)

D=${DAYS:-14}
case "$D" in ''|*[!0-9]*) D=14;; esac
echo "== Running services =="
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null
echo "== Enabled unit files =="
systemctl list-unit-files --state=enabled --no-pager --no-legend 2>/dev/null
echo "== Locally added unit files and their ExecStart =="
for d in /etc/systemd/system /run/systemd/system /usr/local/lib/systemd/system /etc/systemd/user $(getent passwd | awk -F: '{print $6"/.config/systemd/user"}'); do
  [ -d "$d" ] || continue
  find "$d" -maxdepth 2 -type f \( -name '*.service' -o -name '*.timer' -o -name '*.socket' \) 2>/dev/null | while read -r f; do
    echo "-- $f (modified $(stat -c %y "$f" | cut -d. -f1))"
    grep -E '^(ExecStart|ExecStartPre|ExecStartPost|User|WantedBy)=' "$f" 2>/dev/null
  done
done
echo "== Unit files modified in the last $D days =="
find /etc/systemd /usr/lib/systemd /lib/systemd /run/systemd -type f -mtime "-$D" 2>/dev/null | head -n 200
exit 0
