NAME='Shell - Aliases, Functions and PATH Changes'
DESCRIPTION='Aliases, functions and PATH changes in login and rc files of every user. An alias for sudo, ls or ssh, or a PATH starting with a user folder, hijacks commands.'
DEPENDENCIES=()
TAGS=(shell persistence defense-evasion)

printf 'File\tLine\n'
for f in /etc/bash.bashrc /etc/profile /etc/profile.d/* /etc/skel/.bashrc $(getent passwd 2>/dev/null </dev/null | cut -d: -f6 | sort -u | while IFS= read -r h; do for r in .bashrc .bash_profile .profile .zshrc .bash_aliases; do echo "$h/$r"; done; done); do [ -f "$f" ] && grep -E '^\s*(alias |function |export PATH=|PATH=|trap |PROMPT_COMMAND=)' "$f" 2>/dev/null | grep -vE "alias (ls|ll|la|l|grep|egrep|fgrep|dir|vdir|cp|mv|rm)=" | cut -c1-200 | tr '\t' ' ' | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done | head -n 300
exit 0
