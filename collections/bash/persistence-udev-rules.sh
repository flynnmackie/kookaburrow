NAME='Persistence - Udev Rules'
DESCRIPTION='Custom udev rules that run a program when a device appears. A RUN+= or PROGRAM= rule is a stealthy trigger for code on a USB insert or at boot.'
DEPENDENCIES=()
TAGS=(persistence)

printf 'File\tModified\tRule\n'
for f in /etc/udev/rules.d/*.rules /usr/lib/udev/rules.d/*.rules /lib/udev/rules.d/*.rules; do [ -r "$f" ] && grep -E 'RUN\+?=|PROGRAM=|IMPORT\{program\}' "$f" 2>/dev/null | grep -vE '^\s*#' | while IFS= read -r l; do printf '%s\t%s\t%s\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)" "$(echo "$l" | sed 's/\s\+/ /g' | cut -c1-240)"; done; done | grep -E '/etc/udev|[0-9]{4}-' | head -n 400
exit 0
