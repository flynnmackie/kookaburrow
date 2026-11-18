NAME='Shell - Suspicious Commands in History'
DESCRIPTION='Shell history lines that download and run code, open reverse shells, decode payloads, change logs or history, or use common attack tools, for every user.'
DEPENDENCIES=()
TAGS=(shell execution forensics)

printf 'File\tLine\n'
pat='curl .*\| *(ba)?sh|wget .*\| *(ba)?sh|base64 -d|nc -e|ncat -e|/dev/tcp/|bash -i|python.* -c .*socket|chmod \+s|chattr|history -c|unset HISTFILE|HISTSIZE=0|rm -rf /var/log|shred|insmod|setcap|useradd|usermod -aG|authorized_keys|ssh-keygen|iptables -F|ufw disable|crontab -r|/etc/shadow|mimipenguin|linpeas|socat|nmap|masscan|hydra|john|hashcat'
for f in $(getent passwd 2>/dev/null </dev/null | cut -d: -f6 | sort -u | while IFS= read -r h; do for r in .bash_history .zsh_history .sh_history .python_history; do echo "$h/$r"; done; done); do [ -r "$f" ] && grep -E "$pat" "$f" 2>/dev/null | cut -c1-220 | tail -n 40 | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done | head -n 400
exit 0
