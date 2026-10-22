NAME='SSH - Keys and Config'
DESCRIPTION='Lists authorized_keys entries for every user (key type, comment and a short fingerprint source, not the key itself), the size of known_hosts files, and the security-relevant sshd settings. Added authorized keys are a quiet persistence method.'
DEPENDENCIES=()
TAGS=(persistence ssh lateral-movement accounts)

echo '== authorized_keys per user =='
getent passwd | while IFS=: read -r user _ uid _ _ home _; do
  for f in "$home/.ssh/authorized_keys" "$home/.ssh/authorized_keys2"; do
    if [ -r "$f" ]; then
      echo "-- $user (uid $uid): $f (modified $(stat -c %y "$f" 2>/dev/null | cut -d. -f1)) --"
      grep -Ev '^\s*(#|$)' "$f" | awk '{
        n = 1; opts = ""
        if ($1 !~ /^(ssh-|ecdsa-|sk-)/) { opts = $1; n = 2 }
        printf "  type=%s comment=%s %s\n", $n, $(n + 2), (opts != "" ? "options=" substr(opts, 1, 60) : "")
      }'
    fi
  done
done
echo
echo '== known_hosts files (lateral movement hints) =='
getent passwd | while IFS=: read -r user _ _ _ _ home _; do
  f="$home/.ssh/known_hosts"
  [ -r "$f" ] && echo "$user: $(wc -l < "$f") entries ($f)"
done
echo
echo '== sshd effective settings =='
if command -v sshd >/dev/null 2>&1 && sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|permitemptypasswords|pubkeyauthentication|authorizedkeysfile|authorizedkeyscommand|port|allowusers|allowgroups) '; then
  :
else
  grep -Ei '^\s*(PermitRootLogin|PasswordAuthentication|PermitEmptyPasswords|PubkeyAuthentication|AuthorizedKeysFile|AuthorizedKeysCommand|Port|AllowUsers|AllowGroups)\b' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || echo '(sshd config not readable)'
fi
exit 0
