NAME='Shell - History Settings and Disabled History'
DESCRIPTION='Whether shell history is disabled or redirected (HISTFILE, HISTSIZE, histfile symlinks to /dev/null) for every user. Disabled history is a classic sign of someone covering their tracks.'
DEPENDENCIES=()
TAGS=(shell defense-evasion forensics)

printf 'User\tFile\tState\n'
getent passwd 2>/dev/null </dev/null | awk -F: '$7 !~ /(nologin|false)$/ {print $1"\t"$6}' | while IFS="$(printf '\t')" read -r u h; do for r in .bash_history .zsh_history; do f="$h/$r"; if [ -L "$f" ]; then printf '%s\t%s\tsymlink to %s\n' "$u" "$f" "$(readlink "$f")"; elif [ -e "$f" ]; then printf '%s\t%s\t%s bytes, modified %s\n' "$u" "$f" "$(stat -c %s "$f")" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; fi; done; for rc in .bashrc .profile .bash_profile .zshrc; do [ -f "$h/$rc" ] && grep -E 'HISTFILE=|HISTSIZE=0|HISTFILESIZE=0|unset HISTFILE|set \+o history' "$h/$rc" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\t%s\n' "$u" "$h/$rc" "$l"; done; done; done
exit 0
