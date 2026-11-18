NAME='Web - Nginx and PHP Settings'
DESCRIPTION='Nginx server blocks (names, listen ports, roots, proxy targets) and the PHP settings that matter for security (disable_functions, allow_url_include, expose_php).'
DEPENDENCIES=()
TAGS=(web inventory)

printf 'Kind\tValue\n'
command -v nginx >/dev/null 2>&1 && nginx -T 2>/dev/null </dev/null | grep -E '^\s*(server_name|listen|root|proxy_pass|fastcgi_pass|autoindex|ssl_protocols|client_max_body_size)' | sed 's/^\s*//;s/;$//;s/\s\+/ /g' | sort | uniq -c | sort -rn | head -n 60 | while IFS= read -r l; do printf 'nginx\t%s\n' "$l"; done
for f in /etc/php/*/*/php.ini /etc/php.ini; do [ -r "$f" ] && grep -E '^\s*(disable_functions|allow_url_include|allow_url_fopen|expose_php|display_errors|open_basedir|enable_dl|file_uploads)' "$f" 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'php (%s)\t%s\n' "$f" "$l"; done; done
exit 0
