NAME='Shell - Startup Persistence'
DESCRIPTION='Checks system and per-user shell startup files (profile, bashrc, profile.d) changed in the last 30 days, and greps them for download cradles, reverse shell patterns and encoded payloads. These files run on every login so attackers append commands to them.'
DEPENDENCIES=()
TAGS=(persistence execution shell)

patterns='curl .*\|.*(ba)?sh|wget .*\|.*(ba)?sh|/dev/tcp/|nc .* -e |ncat .* -e |bash -i|base64 -d|python.* -c .*socket|mkfifo|LD_PRELOAD|eval .*(curl|wget|base64)|chmod \+x /(tmp|dev/shm|var/tmp)'

userfiles=$(getent passwd | while IFS=: read -r _ _ _ _ _ home _; do
  for h in .bashrc .bash_profile .bash_login .profile .zshrc .zprofile .zshenv .bash_logout; do
    [ -e "$home/$h" ] && echo "$home/$h"
  done
done)
files="/etc/profile /etc/bash.bashrc /etc/bashrc /etc/environment $(ls /etc/profile.d/* 2>/dev/null | tr '\n' ' ') $userfiles"

echo '== Startup files changed in the last 30 days =='
# shellcheck disable=SC2086
find $files -maxdepth 0 -type f -mtime -30 -printf '%TY-%Tm-%Td %TH:%TM  %u  %p\n' 2>/dev/null | sort -r
echo
echo '== Suspicious patterns in startup files =='
hit=0
for f in $files; do
  [ -r "$f" ] || continue
  if out=$(grep -nE "$patterns" "$f" 2>/dev/null); then
    echo "-- $f --"
    echo "$out"
    hit=1
  fi
done
[ "$hit" -eq 0 ] && echo '(none found)'
exit 0
