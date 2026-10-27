NAME='SSH - Sessions and Known Hosts'
DESCRIPTION='Current SSH sessions and connections, the known_hosts file of every user. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(ssh lateral-movement accounts)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Active SSH connections =="; ss -tnp 2>/dev/null | grep -E ':22\b|ssh'
echo "== sshd sessions =="; ps -eo pid,user,lstart,cmd 2>/dev/null | grep -E 'sshd:|ssh ' | grep -v grep
echo "== known_hosts and ssh config per user =="
getent passwd | awk -F: '$6 != "" {print $1":"$6}' | while IFS=: read -r u h; do
  for f in "$h/.ssh/known_hosts" "$h/.ssh/config"; do
    [ -r "$f" ] || $SUDO test -r "$f" 2>/dev/null || continue
    echo "-- $u: $f"
    $SUDO cat "$f" 2>/dev/null | awk '{ if ($1 ~ /^\|1\|/) print "(hashed) " $2 " " $3; else print $0 }' | cut -c1-200 | head -n 100
  done
done
echo "== SSH agent sockets =="
ls -l /tmp/ssh-*/agent.* /run/user/*/openssh_agent 2>/dev/null
exit 0
