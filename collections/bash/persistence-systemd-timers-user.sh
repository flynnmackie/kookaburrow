NAME='Persistence - Systemd Timers and User Units'
DESCRIPTION='Timers, and the units that users define in their own home directories (user services run without root and survive logout when lingering is on).'
DEPENDENCIES=()
TAGS=(persistence systemd)

printf 'Kind\tUnit\tDetail\n'
if command -v systemctl >/dev/null 2>&1; then systemctl list-timers --all --no-pager --no-legend 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {print "timer", $(NF-1), $0}' | cut -c1-260; fi
getent passwd 2>/dev/null </dev/null | cut -d: -f6 | sort -u | while IFS= read -r h; do for d in "$h/.config/systemd/user" "$h/.local/share/systemd/user"; do [ -d "$d" ] && for f in "$d"/*.service "$d"/*.timer; do [ -e "$f" ] && printf 'user unit\t%s\t%s\n' "$f" "$(grep -E '^(ExecStart|OnCalendar)=' "$f" 2>/dev/null | tr '\n' ' ')"; done; done; done
ls /var/lib/systemd/linger 2>/dev/null | while IFS= read -r u; do printf 'linger\t%s\tservices keep running after logout\n' "$u"; done
exit 0
