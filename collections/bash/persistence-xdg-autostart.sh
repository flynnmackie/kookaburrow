NAME='Persistence - Desktop Autostart Entries'
DESCRIPTION='Autostart .desktop files of the system and of every user, with the command they run. Desktop hosts use these to run programs at login.'
DEPENDENCIES=()
TAGS=(persistence)

printf 'File\tName\tExec\n'
for d in /etc/xdg/autostart $(getent passwd 2>/dev/null </dev/null | cut -d: -f6 | sort -u | sed 's#$#/.config/autostart#'); do [ -d "$d" ] && for f in "$d"/*.desktop; do [ -e "$f" ] && printf '%s\t%s\t%s\n' "$f" "$(grep -m1 '^Name=' "$f" 2>/dev/null | cut -d= -f2-)" "$(grep -m1 '^Exec=' "$f" 2>/dev/null | cut -d= -f2-)"; done; done
exit 0
