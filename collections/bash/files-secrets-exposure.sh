NAME='Files - Secrets Exposure'
DESCRIPTION='Finds files that contain credentials or key material and lists only their paths, owner, permissions and what kind of secret matched, never the secret itself. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(SEARCH_PATH?)
TAGS=(accounts privilege-escalation discovery filesystem)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
ROOTS=${SEARCH_PATH:-/home:/root:/opt:/srv:/var/www:/etc}
IFS=: read -ra DIRS <<< "$ROOTS"
echo "kind	owner	mode	modified	path"
scan() { # kind regex
  for d in "${DIRS[@]}"; do [ -d "$d" ] && $SUDO grep -rIlE --exclude-dir=proc --exclude-dir=.git --exclude='*.log' --exclude='*.so*' -e "$2" "$d" 2>/dev/null; done | head -n 100 | while read -r f; do
    printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$($SUDO stat -c %U "$f" 2>/dev/null)" "$($SUDO stat -c %a "$f" 2>/dev/null)" "$($SUDO stat -c %y "$f" 2>/dev/null | cut -d. -f1)" "$f"
  done
}
scan 'private key' '-----BEGIN ((RSA|DSA|EC|OPENSSH|PGP) )?PRIVATE KEY'
scan 'aws access key' 'AKIA[0-9A-Z]{16}'
scan 'password or token assignment' '(password|passwd|secret|api[_-]?key|token)[[:space:]]*[=:][[:space:]]*[^[:space:]#<$]{6,}'
for d in "${DIRS[@]}"; do [ -d "$d" ] && $SUDO find "$d" -maxdepth 4 \( -name '.netrc' -o -name '.pgpass' -o -name '.git-credentials' -o -name 'credentials' -o -name '*.kdbx' -o -name '.my.cnf' \) -type f 2>/dev/null; done | while read -r f; do
  printf 'credential file\t%s\t%s\t%s\t%s\n' "$($SUDO stat -c %U "$f" 2>/dev/null)" "$($SUDO stat -c %a "$f" 2>/dev/null)" "$($SUDO stat -c %y "$f" 2>/dev/null | cut -d. -f1)" "$f"
done
exit 0
