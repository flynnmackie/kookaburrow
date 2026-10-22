NAME='Files - Webshell Hunt'
DESCRIPTION='Searches web folders for likely web shells: script files (php, jsp, aspx, py, pl, cgi) containing dangerous patterns (eval of request data, base64 decoding, system, passthru, shell_exec, assert, preg_replace with the e modifier, Runtime.exec) and script files changed recently. WEB_ROOT is a colon separated list of folders (default /var/www:/srv/www:/usr/share/nginx/html:/opt); DAYS (default 30) limits the recently changed list. Needs root, or an account with passwordless sudo, to read all web folders.'
DEPENDENCIES=()
PARAMETERS=(WEB_ROOT? DAYS?)
TAGS=(malware persistence filesystem c2)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-30}; case "$D" in ''|*[!0-9]*) D=30;; esac
ROOTS=${WEB_ROOT:-/var/www:/srv/www:/usr/share/nginx/html:/opt}
IFS=: read -ra DIRS <<< "$ROOTS"
pat='eval\s*\(\s*(base64_decode|\$_(GET|POST|REQUEST|COOKIE)|gzinflate|str_rot13)|(system|passthru|shell_exec|exec|popen|proc_open)\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)|assert\s*\(\s*\$_|preg_replace\s*\(.*/e["'\'']|FromBase64String|Runtime\.getRuntime\(\)\.exec|ProcessBuilder\(|Request\.(Form|QueryString)\[.*\]\s*\)\s*;?\s*Process'
echo "== Files containing web shell patterns =="
for d in "${DIRS[@]}"; do [ -d "$d" ] && $SUDO grep -rIlE --include='*.php' --include='*.phtml' --include='*.php5' --include='*.jsp' --include='*.jspx' --include='*.aspx' --include='*.asp' --include='*.ashx' --include='*.py' --include='*.pl' --include='*.cgi' "$pat" "$d" 2>/dev/null; done | while read -r f; do
  printf '%s\t%s\t%s\n' "$(stat -c '%y' "$f" | cut -d. -f1)" "$(sha256sum "$f" 2>/dev/null | cut -c1-64)" "$f"
done
echo "== Script files changed in the last $D days =="
for d in "${DIRS[@]}"; do [ -d "$d" ] && $SUDO find "$d" -type f \( -name '*.php' -o -name '*.phtml' -o -name '*.jsp' -o -name '*.aspx' -o -name '*.asp' -o -name '*.cgi' -o -name '*.py' \) -mtime "-$D" -printf '%TY-%Tm-%Td %TH:%TM\t%u\t%s\t%p\n' 2>/dev/null; done | sort -r | head -n 300
exit 0
