NAME='Persistence - Login Shell Scripts'
DESCRIPTION='Scripts in /etc/profile.d and the profile and bashrc files that run at every login, with their last modification time. Added lines here run for every user.'
DEPENDENCIES=()
TAGS=(persistence shell)

printf 'File\tModified\tSize\tSuspicious\n'
for f in /etc/profile /etc/bash.bashrc /etc/bashrc /etc/environment /etc/zsh/zshenv /etc/zsh/zprofile /etc/profile.d/*; do [ -f "$f" ] && printf '%s\t%s\t%s\t%s\n' "$f" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)" "$(stat -c %s "$f" 2>/dev/null)" "$(grep -cE 'curl|wget|nc |ncat|/dev/tcp|base64 -d|python -c|perl -e|eval ' "$f" 2>/dev/null)"; done
exit 0
