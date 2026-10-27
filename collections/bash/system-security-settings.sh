NAME='System - Security Settings'
DESCRIPTION='Security-relevant configuration in one place.'
DEPENDENCIES=()
TAGS=(inventory defense-evasion)

echo "== Kernel hardening =="
for k in kernel.randomize_va_space kernel.yama.ptrace_scope kernel.kptr_restrict kernel.dmesg_restrict kernel.unprivileged_bpf_disabled kernel.modules_disabled fs.suid_dumpable net.ipv4.conf.all.rp_filter net.ipv4.conf.all.accept_redirects net.ipv4.tcp_syncookies kernel.core_pattern; do
  echo "$k = $(sysctl -n "$k" 2>/dev/null)"
done
echo "== SSH daemon =="
sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|x11forwarding|allowusers|allowgroups|port|permittunnel|gatewayports|authorizedkeysfile)' || grep -hE '^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|PermitEmptyPasswords|Port|AllowUsers) ' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
echo "== Password policy =="
grep -E '^(PASS_MAX_DAYS|PASS_MIN_DAYS|PASS_MIN_LEN|UMASK|ENCRYPT_METHOD)' /etc/login.defs 2>/dev/null
grep -rE 'pam_pwquality|pam_cracklib|pam_faillock|pam_tally2' /etc/pam.d 2>/dev/null | head -10
echo "== sudo defaults =="
grep -rhE '^Defaults' /etc/sudoers /etc/sudoers.d 2>/dev/null
exit 0
