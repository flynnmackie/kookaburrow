NAME='Web - Server Config'
DESCRIPTION='What web servers are running and how they are configured: nginx server names, document roots, proxied backends and listening ports; Apache virtual hosts and loaded modules; PHP settings that matter for compromise (disabled functions, auto-prepend and auto-append files); and Tomcat web applications. Shows where a web shell could sit and what is exposed. Needs root, or an account with passwordless sudo, to read all configuration.'
DEPENDENCIES=()
TAGS=(inventory c2 persistence filesystem)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Web server processes =="; ps -eo pid,user,args 2>/dev/null | grep -E 'nginx|apache2|httpd|tomcat|catalina|php-fpm|lighttpd|caddy' | grep -v grep
if command -v nginx >/dev/null 2>&1; then
  echo "== nginx (server_name, listen, root, proxy_pass, include) =="
  $SUDO nginx -T 2>/dev/null | grep -E '^\s*(server_name|listen|root|alias|proxy_pass|fastcgi_pass|include|ssl_certificate) ' | sed 's/^\s*//' | sort -u | head -n 150
fi
if command -v apache2ctl >/dev/null 2>&1 || command -v httpd >/dev/null 2>&1; then
  A=$(command -v apache2ctl || command -v httpd)
  echo "== Apache virtual hosts =="; $SUDO "$A" -S 2>&1 | head -n 40
  echo "== Apache modules =="; $SUDO "$A" -M 2>&1 | head -n 80
fi
echo "== PHP settings =="
for f in $(ls /etc/php/*/*/php.ini /etc/php.ini 2>/dev/null); do echo "-- $f"; grep -E '^(disable_functions|auto_prepend_file|auto_append_file|allow_url_fopen|allow_url_include|expose_php|open_basedir|upload_tmp_dir)' "$f"; done
echo "== Tomcat webapps =="
for d in /var/lib/tomcat*/webapps /opt/tomcat*/webapps /usr/share/tomcat*/webapps /opt/*/webapps; do [ -d "$d" ] && { echo "-- $d"; ls -l --time-style=long-iso "$d" | tail -n +2; }; done
echo "== Document root contents (top level) =="
for d in /var/www /srv/www /usr/share/nginx/html; do [ -d "$d" ] && { echo "-- $d"; ls -la --time-style=long-iso "$d" | head -n 30; }; done
exit 0
