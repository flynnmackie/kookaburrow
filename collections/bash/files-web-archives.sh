NAME='Files - Archives and Backups in Web Roots'
DESCRIPTION='Archives, database dumps, backups and editor leftovers inside web server folders (zip, tar, sql, bak, old, swp). They are downloadable by anyone and often hold source and credentials.'
DEPENDENCIES=()
TAGS=(filesystem web exfiltration)

printf 'Path\tSize\tModified\n'
for d in /var/www /srv/www /srv/http /usr/share/nginx /opt/lampp/htdocs /var/lib/tomcat*/webapps /usr/local/apache2/htdocs; do [ -d "$d" ] && find "$d" -xdev -type f \( -name '*.zip' -o -name '*.tar' -o -name '*.tar.gz' -o -name '*.tgz' -o -name '*.7z' -o -name '*.rar' -o -name '*.sql' -o -name '*.sql.gz' -o -name '*.bak' -o -name '*.old' -o -name '*.orig' -o -name '*.swp' -o -name '*~' -o -name '.env' -o -name '*.log' \) -printf '%p\t%s\t%TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | head -n 100; done
exit 0
