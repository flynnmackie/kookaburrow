NAME='SSH - Daemon Effective Configuration'
DESCRIPTION='The settings sshd is actually using (sshd -T): root login, password authentication, forwarding, allowed users, ciphers and subsystems. Weak or changed settings widen access.'
DEPENDENCIES=()
TAGS=(ssh security)

printf 'Setting\tValue\n'
if command -v sshd >/dev/null 2>&1 || [ -x /usr/sbin/sshd ]; then ( sshd -T 2>/dev/null </dev/null || /usr/sbin/sshd -T 2>/dev/null </dev/null ) | grep -E '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|x11forwarding|allowtcpforwarding|gatewayports|permittunnel|allowusers|allowgroups|denyusers|authorizedkeysfile|authorizedkeyscommand|authorizedkeyscommanduser|usepam|maxauthtries|loglevel|subsystem|permituserenvironment|forcecommand|listenaddress|banner|clientaliveinterval)' | sed 's/ /\t/' ; fi
exit 0
