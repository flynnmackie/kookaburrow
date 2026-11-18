NAME='Persistence - Network and Login Hook Scripts'
DESCRIPTION='Scripts run on network changes and logins: NetworkManager dispatcher, ifup hooks, motd generators and PAM exec hooks. Quietly run as root.'
DEPENDENCIES=()
TAGS=(persistence)

printf 'Directory\tFile\tModified\n'
for d in /etc/NetworkManager/dispatcher.d /etc/network/if-up.d /etc/network/if-pre-up.d /etc/network/if-post-down.d /etc/update-motd.d /etc/pm/sleep.d /usr/lib/pm-utils/sleep.d; do [ -d "$d" ] && for f in "$d"/*; do [ -f "$f" ] && printf '%s\t%s\t%s\n' "$d" "$(basename "$f")" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; done; done
grep -rEl 'pam_exec' /etc/pam.d 2>/dev/null | while IFS= read -r f; do printf '/etc/pam.d (pam_exec)\t%s\t%s\n' "$f" "$(grep -h pam_exec "$f" | head -n1 | sed 's/\s\+/ /g')"; done
exit 0
