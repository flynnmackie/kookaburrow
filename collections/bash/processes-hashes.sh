NAME='Processes - Hashes'
DESCRIPTION='Every running process with user, parent, start time, command line, working directory, executable path and the SHA-256 of the executable, flagging executables that were deleted from disk (a running process whose file has been removed is a classic sign of malware). CONTAINS limits to processes whose command or path contains that text. Needs root, or an account with passwordless sudo, to see all processes.'
DEPENDENCIES=()
PARAMETERS=(CONTAINS?)
TAGS=(processes execution malware)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "pid	ppid	user	started	exe	deleted	sha256	cwd	cmdline"
for p in /proc/[0-9]*; do
  pid=${p#/proc/}
  exe=$($SUDO readlink "$p/exe" 2>/dev/null) || continue
  [ -n "$exe" ] || continue
  cmd=$($SUDO cat "$p/cmdline" 2>/dev/null | tr '\0' ' ' | cut -c1-300)
  if [ -n "$CONTAINS" ] && ! echo "$exe $cmd" | grep -qiF -- "$CONTAINS"; then continue; fi
  deleted=no; case "$exe" in *'(deleted)') deleted=YES;; esac
  sha=$($SUDO sha256sum "$p/exe" 2>/dev/null | cut -d' ' -f1)
  ppid=$(awk '{print $4}' "$p/stat" 2>/dev/null)
  user=$(stat -c %U "$p" 2>/dev/null)
  start=$(ps -o lstart= -p "$pid" 2>/dev/null | sed 's/  */ /g')
  cwd=$($SUDO readlink "$p/cwd" 2>/dev/null)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$pid" "$ppid" "$user" "$start" "$exe" "$deleted" "$sha" "$cwd" "$cmd"
done
exit 0
