NAME='Files - Directory Listing'
DESCRIPTION='Lists the contents of a folder with permissions, owner, size and full timestamps, including hidden files. Optionally recursive. DIR_PATH is required; MAX_RESULTS defaults to 5000. Use it to see what is in a staging folder, a home directory or a web root.'
DEPENDENCIES=()
PARAMETERS=(DIR_PATH RECURSE? MAX_RESULTS?)
TAGS=(filesystem discovery)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
M=${MAX_RESULTS:-5000}; case "$M" in ''|*[!0-9]*) M=5000;; esac
echo "modified	mode	owner	group	size	type	path"
case "$RECURSE" in y|yes|true|1) D="";; *) D="-maxdepth 1";; esac
$SUDO find "$DIR_PATH" $D -mindepth 1 -printf '%TY-%Tm-%Td %TH:%TM\t%m\t%u\t%g\t%s\t%y\t%p\n' 2>/dev/null | head -n "$M"
exit 0
