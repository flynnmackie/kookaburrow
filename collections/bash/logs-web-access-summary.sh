NAME='Logs - Web Access Summary'
DESCRIPTION='Busiest client addresses, error responses and the most requested paths from the Apache and Nginx access logs. Shows scanning, brute forcing and web shell access.'
DEPENDENCIES=()
TAGS=(web network forensics)

printf 'Kind\tValue\tCount\n'
for f in /var/log/apache2/access.log /var/log/httpd/access_log /var/log/nginx/access.log; do [ -r "$f" ] || continue
  awk -v k="client" 'BEGIN{OFS="\t"} {c[$1]++} END{for(i in c) print k,i,c[i]}' "$f" 2>/dev/null | sort -t"$(printf '\t')" -k3 -rn | head -n 10
  awk 'BEGIN{OFS="\t"} {c[$9]++} END{for(i in c) print "status",i,c[i]}' "$f" 2>/dev/null | sort -t"$(printf '\t')" -k3 -rn | head -n 8
  awk 'BEGIN{OFS="\t"} $9 ~ /^(200|500)$/ && $7 ~ /\.(php|jsp|aspx|asp)\?(cmd|c|exec|shell)=/ {c[$7]++} END{for(i in c) print "suspicious path",substr(i,1,150),c[i]}' "$f" 2>/dev/null | head -n 10
  awk 'BEGIN{OFS="\t"} {c[$7]++} END{for(i in c) print "path",substr(i,1,150),c[i]}' "$f" 2>/dev/null | sort -t"$(printf '\t')" -k3 -rn | head -n 10; done
exit 0
