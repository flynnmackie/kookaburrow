NAME='Processes - Hidden PIDs'
DESCRIPTION='Finds processes hidden from the process list. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(MAX_PID?)
TAGS=(rootkit processes malware defense-evasion)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
M=${MAX_PID:-65535}; case "$M" in ''|*[!0-9]*) M=65535;; esac
listed=$(mktemp); live=$(mktemp); cand=$(mktemp)
$SUDO ls /proc 2>/dev/null | grep -E '^[0-9]+$' | sort -n > "$listed"
$SUDO bash -c "for p in \$(seq 2 $M); do kill -0 \$p 2>/dev/null && echo \$p; done" | sort -n > "$live"
is_thread() { tg=$($SUDO awk '/^Tgid:/ {print $2}' "/proc/$1/status" 2>/dev/null); [ -n "$tg" ] && [ "$tg" != "$1" ]; }
while read -r p; do
  grep -qx "$p" "$listed" && continue
  is_thread "$p" && continue
  echo "$p" >> "$cand"
done < "$live"
sleep 1
$SUDO ls /proc 2>/dev/null | grep -E '^[0-9]+$' | sort -n > "$listed"   # short-lived processes (including this scan own helpers) have gone or are listed by now
echo "pid	why	comm	exe"
n=0
while read -r p; do
  $SUDO bash -c "kill -0 $p" 2>/dev/null || continue
  grep -qx "$p" "$listed" && continue
  is_thread "$p" && continue
  tg=$($SUDO awk '/^Tgid:/ {print $2}' "/proc/$p/status" 2>/dev/null)
  why="answers signals but is not in the /proc listing"; [ -z "$tg" ] && why="answers signals but /proc/$p cannot be opened at all"
  n=$((n+1))
  printf '%s\t%s\t%s\t%s\n' "$p" "$why" "$($SUDO cat /proc/$p/comm 2>/dev/null)" "$($SUDO readlink /proc/$p/exe 2>/dev/null)"
done < "$cand"
echo "probed up to PID $M: $(wc -l < "$live") live ids, $n hidden process(es) (none listed above means none found)"
echo "== Processes whose parent is gone =="
$SUDO ps -eo pid=,ppid=,user=,comm= 2>/dev/null | awk '$2>1 {print}' | while read -r pid ppid u c; do $SUDO test -d "/proc/$ppid" || echo "pid $pid ($u $c) has missing parent $ppid"; done
rm -f "$listed" "$live" "$cand"
exit 0
