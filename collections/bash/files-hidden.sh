NAME='Files - Hidden Files and Folders in Unusual Places'
DESCRIPTION='Dot files and folders in /tmp, /var/tmp, /dev/shm, /usr, /etc, /var/www and /opt, which are rarely hidden for a good reason. Attackers use hidden directories to keep tools.'
DEPENDENCIES=()
TAGS=(filesystem defense-evasion malware)

printf 'Path\tType\tSize\tModified\tOwner\n'
for d in /tmp /var/tmp /dev/shm /usr /etc /opt /var/www /srv /boot; do [ -d "$d" ] && find "$d" -xdev -name '.*' ! -name '.' ! -name '..' ! -path '*/.cache/*' ! -path '/usr/share/*' ! -path '/usr/lib/*/.build-id*' ! -name '.keep' ! -name '.gitkeep' ! -name '.htaccess' ! -name '.gitignore' ! -name '.placeholder' -printf '%p\t%y\t%s\t%TY-%Tm-%Td %TH:%TM\t%u\n' 2>/dev/null | head -n 100; done
exit 0
