NAME='Processes - Suspicious'
DESCRIPTION='Walks /proc for processes whose executable has been deleted from disk or runs from /tmp, /var/tmp or /dev/shm. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(execution malware processes defense-evasion)

echo '== Suspicious processes (pid, user, executable, command line) =='
found=0
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  exe=$(readlink "$p/exe" 2>/dev/null) || continue
  case "$exe" in
    *'(deleted)'*|/tmp/*|/var/tmp/*|/dev/shm/*)
      user=$(stat -c %U "$p" 2>/dev/null)
      cmd=$(tr '\0' ' ' 2>/dev/null < "$p/cmdline" | cut -c1-200)
      printf '%s\t%s\t%s\t%s\n' "$pid" "$user" "$exe" "$cmd"
      found=1
      ;;
  esac
done
[ "$found" -eq 0 ] && echo '(none found)'
echo
echo '== Processes started from a deleted working directory =='
for p in /proc/[0-9]*; do
  cwd=$(readlink "$p/cwd" 2>/dev/null) || continue
  case "$cwd" in *'(deleted)'*) printf '%s\t%s\n' "${p#/proc/}" "$cwd";; esac
done
exit 0
