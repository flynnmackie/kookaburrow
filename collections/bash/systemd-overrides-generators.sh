NAME='Systemd - Overrides and Generators'
DESCRIPTION='Quiet systemd persistence: drop-in override folders (*.service.d) that change what a service runs, systemd generators (programs run at every boot and daemon-reload), environment generators, user-level units and systemd tmpfiles and sysusers entries added outside packages. Attackers use drop-ins to add ExecStartPre commands to legitimate services. Shows each with its modification time and any command it runs.'
DEPENDENCIES=()
TAGS=(persistence systemd)

echo "== Drop-in overrides and the commands they add =="
find /etc/systemd /run/systemd /usr/lib/systemd/system /lib/systemd/system -type d -name '*.d' 2>/dev/null | while read -r d; do
  for f in "$d"/*.conf; do [ -f "$f" ] || continue
    case "$f" in /usr/lib/*|/lib/*) ;; esac
    c=$(grep -E '^(ExecStart|ExecStartPre|ExecStartPost|ExecStop|ExecReload|Environment|User|LD_PRELOAD)' "$f" 2>/dev/null | tr '\n' ';' | cut -c1-200)
    printf '%s\t%s\t%s\n' "$(stat -c %y "$f" | cut -d. -f1)" "$f" "$c"
  done
done | sort -r | head -n 200
echo "== Generators =="
ls -l --time-style=long-iso /etc/systemd/system-generators /etc/systemd/user-generators /run/systemd/system-generators /usr/local/lib/systemd/system-generators /usr/lib/systemd/system-generators /lib/systemd/system-generators 2>/dev/null | grep -v '^total'
echo "== Environment generators =="; ls -l --time-style=long-iso /etc/systemd/system-environment-generators /usr/lib/systemd/system-environment-generators 2>/dev/null | grep -v '^total'
echo "== tmpfiles and sysusers added locally =="; ls -l --time-style=long-iso /etc/tmpfiles.d /etc/sysusers.d 2>/dev/null | grep -v '^total'
echo "== User units =="; find /home /root -path '*/.config/systemd/user/*' -type f -printf '%TY-%Tm-%Td %TH:%TM\t%u\t%p\n' 2>/dev/null
exit 0
