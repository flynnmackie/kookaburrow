NAME='Shell - History'
DESCRIPTION='Prints the last 100 lines of bash, zsh and sh history for every account with a readable home directory.'
DEPENDENCIES=()
TAGS=(execution history forensics defense-evasion)

getent passwd | while IFS=: read -r user _ uid _ _ home shell; do
  for h in .bash_history .zsh_history .sh_history .history; do
    f="$home/$h"
    if [ -e "$f" ]; then
      if [ -L "$f" ] && [ "$(readlink "$f")" = /dev/null ]; then
        echo "-- $user: $f is a symlink to /dev/null (history disabled) --"
      elif [ -r "$f" ]; then
        echo "-- $user (uid $uid, modified $(stat -c %y "$f" 2>/dev/null | cut -d. -f1)): $f --"
        tail -n 100 "$f"
        echo
      else
        echo "-- $user: $f exists but is not readable --"
      fi
    fi
  done
done
exit 0
