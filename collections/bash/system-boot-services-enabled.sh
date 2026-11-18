NAME='System - Enabled Services and Targets'
DESCRIPTION='Every enabled systemd service and socket, with the unit file and whether it is shipped by a package. A full picture of what starts at boot.'
DEPENDENCIES=()
TAGS=(system persistence systemd)

printf 'Unit\tState\tFile\tPackaged\n'
command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files --state=enabled --no-legend --no-pager 2>/dev/null </dev/null | awk '{print $1}' | grep -E '\.(service|socket|timer|path)$' | while IFS= read -r u; do f=$(systemctl show "$u" -p FragmentPath --value 2>/dev/null </dev/null); pk=no; [ -n "$f" ] && { command -v dpkg >/dev/null 2>&1 && dpkg -S "$f" >/dev/null 2>&1 && pk=yes; command -v rpm >/dev/null 2>&1 && rpm -qf "$f" >/dev/null 2>&1 && pk=yes; }; printf '%s\tenabled\t%s\t%s\n' "$u" "$f" "$pk"; done | head -n 500
exit 0
