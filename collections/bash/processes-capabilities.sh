NAME='Processes - Capabilities and Privileges'
DESCRIPTION='Processes that hold dangerous Linux capabilities (SYS_ADMIN, SYS_PTRACE, NET_ADMIN, DAC_OVERRIDE and more) while not running as root, which is how containers and tools raise privilege.'
DEPENDENCIES=()
TAGS=(processes privilege-escalation)

printf 'Pid\tUser\tName\tEffectiveCaps\tNoNewPrivs\n'
for p in /proc/[0-9]*; do pid=${p#/proc/}; [ -r "$p/status" ] || continue
  eff=$(awk '/^CapEff:/{print $2}' "$p/status" 2>/dev/null); uid=$(awk '/^Uid:/{print $2}' "$p/status" 2>/dev/null); nn=$(awk '/^NoNewPrivs:/{print $2}' "$p/status" 2>/dev/null)
  [ "$uid" = 0 ] && continue; [ "$eff" = 0000000000000000 ] && continue; [ -z "$eff" ] && continue
  printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$(id -nu "$uid" 2>/dev/null || echo "$uid")" "$(awk '/^Name:/{print $2}' "$p/status")" "$eff" "$nn"; done
exit 0
