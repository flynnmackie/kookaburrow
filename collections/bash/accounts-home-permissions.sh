NAME='Accounts - Home Directory Ownership and Permissions'
DESCRIPTION='Home directories that are world-writable, owned by another user or missing, and homes of system accounts. Writable homes allow planted dotfiles and keys.'
DEPENDENCIES=()
TAGS=(accounts filesystem privilege-escalation)

printf 'User\tHome\tOwner\tMode\tProblem\n'
getent passwd 2>/dev/null </dev/null | awk -F: '$3>=1000 || $3==0 {print $1"\t"$6}' | while IFS="$(printf '\t')" read -r u h; do
  if [ -d "$h" ]; then own=$(stat -c %U "$h" 2>/dev/null); mode=$(stat -c %a "$h" 2>/dev/null); prob=""
    [ "$own" != "$u" ] && prob="owned by $own"; case "$mode" in *[2367]) prob="$prob world-writable";; *[2367]?) ;; esac
    [ -n "$prob" ] && printf '%s\t%s\t%s\t%s\t%s\n' "$u" "$h" "$own" "$mode" "$prob"
  else printf '%s\t%s\t\t\tmissing\n' "$u" "$h"; fi
done
exit 0
