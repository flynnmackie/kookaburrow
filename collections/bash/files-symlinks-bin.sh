NAME='Files - Suspicious Symbolic Links'
DESCRIPTION='Symbolic links in program and temp folders that point to temp folders, home directories, /dev/null or to files that do not exist. Used to redirect programs and hide files.'
DEPENDENCIES=()
TAGS=(filesystem defense-evasion)

printf 'Link\tTarget\tBroken\n'
for d in /usr/bin /usr/sbin /bin /sbin /usr/local /etc /tmp /var/tmp /opt /lib/systemd /var/www; do [ -d "$d" ] && find "$d" -xdev -type l -printf '%p\t%l\n' 2>/dev/null | while IFS="$(printf '\t')" read -r l t; do b=no; [ -e "$l" ] || b=yes; case "$t" in /tmp/*|/dev/shm/*|/var/tmp/*|/home/*|/root/*|/dev/null) :;; *) [ "$b" = no ] && continue;; esac; printf '%s\t%s\t%s\n' "$l" "$t" "$b"; done; done | head -n 300
exit 0
