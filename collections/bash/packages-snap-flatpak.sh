NAME='Packages - Snap and Flatpak Apps'
DESCRIPTION='Applications installed as snaps and flatpaks. They install outside the normal package manager and update on their own.'
DEPENDENCIES=()
TAGS=(inventory packages)

printf 'Kind\tName\tVersion\tSource\n'
command -v snap >/dev/null 2>&1 && snap list 2>/dev/null </dev/null | awk 'NR>1 {print "snap\t"$1"\t"$2"\t"$4}'
command -v flatpak >/dev/null 2>&1 && flatpak list --columns=application,version,origin 2>/dev/null </dev/null | awk -F'\t' '{print "flatpak\t"$1"\t"$2"\t"$3}'
exit 0
