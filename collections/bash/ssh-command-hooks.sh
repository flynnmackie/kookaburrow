NAME='SSH - Command Hooks'
DESCRIPTION='SSH features that run commands, used for backdoors and persistence. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(ssh persistence privilege-escalation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== sshd configuration hooks =="
$SUDO grep -rnE '^\s*(AuthorizedKeysCommand|AuthorizedKeysCommandUser|ForceCommand|Match |PermitTunnel|GatewayPorts|PermitUserEnvironment|AcceptEnv|Subsystem)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d 2>/dev/null
echo "== System and user ssh rc scripts =="
ls -l --time-style=long-iso /etc/ssh/sshrc 2>/dev/null
getent passwd | awk -F: '$6 != "" {print $1":"$6}' | while IFS=: read -r u h; do
  $SUDO test -f "$h/.ssh/rc" && { echo "-- $u: $h/.ssh/rc"; $SUDO head -n 20 "$h/.ssh/rc"; }
  for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do
    $SUDO test -f "$f" || continue
    $SUDO grep -nE '^(command=|no-pty|environment=|permitopen|permitlisten|from=|tunnel=|principals=|cert-authority)' "$f" 2>/dev/null | sed "s|^|$u: $f: |" | cut -c1-260
  done
  $SUDO test -f "$h/.ssh/config" && $SUDO grep -nEi '^\s*(ProxyCommand|LocalCommand|PermitLocalCommand|KnownHostsCommand|Include)' "$h/.ssh/config" 2>/dev/null | sed "s|^|$u: client config: |"
done
exit 0
