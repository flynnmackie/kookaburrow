NAME='Web - Tomcat and Java Web Applications'
DESCRIPTION='Deployed Tomcat and Jetty web applications, WAR files and the manager users. Unexpected WAR files are a classic web shell delivery.'
DEPENDENCIES=()
TAGS=(web inventory)

printf 'Kind\tPath\tModified\n'
for d in /var/lib/tomcat*/webapps /opt/tomcat*/webapps /usr/share/tomcat*/webapps /opt/jetty*/webapps /srv/tomcat*/webapps; do [ -d "$d" ] && for f in "$d"/*; do [ -e "$f" ] && printf '%s\t%s\t%s\n' "$([ -d "$f" ] && echo app || echo file)" "$f" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; done; done
for f in /etc/tomcat*/tomcat-users.xml /opt/tomcat*/conf/tomcat-users.xml; do [ -r "$f" ] && grep -E '<user ' "$f" 2>/dev/null | sed 's/password="[^"]*"/password="hidden"/' | while IFS= read -r l; do printf 'tomcat user\t%s\t\n' "$l"; done; done
exit 0
