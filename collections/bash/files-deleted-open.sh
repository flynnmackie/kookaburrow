NAME='Files - Deleted but Open'
DESCRIPTION='Files that have been deleted from disk but are still open by a running process, with the process, owner and size. Malware often deletes its own binary or a dropped file while it runs, and the content can still be recovered from /proc/PID/exe or /proc/PID/fd. Needs root, or an account with passwordless sudo, to see all processes.'
DEPENDENCIES=()
TAGS=(processes forensics malware defense-evasion)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "pid	user	process	fd	target"
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  for l in $($SUDO ls "$p/fd" 2>/dev/null); do
    t=$($SUDO readlink "$p/fd/$l" 2>/dev/null)
    case "$t" in *'(deleted)') case "$t" in /memfd:*|/dev/*|*/shm/*|socket:*) ;; *) printf '%s\t%s\t%s\tfd/%s\t%s\n' "$pid" "$(stat -c %U "$p" 2>/dev/null)" "$(cat "$p/comm" 2>/dev/null)" "$l" "$t";; esac;; esac
  done
  e=$($SUDO readlink "$p/exe" 2>/dev/null); case "$e" in *'(deleted)') printf '%s\t%s\t%s\texe\t%s\n' "$pid" "$(stat -c %U "$p" 2>/dev/null)" "$(cat "$p/comm" 2>/dev/null)" "$e";; esac
done
exit 0
