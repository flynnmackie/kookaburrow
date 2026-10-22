NAME='Security - Apply Kernel Hardening'
DESCRIPTION='Applies a safe set of kernel hardening settings through /etc/sysctl.d/99-kookaburrow-hardening.conf and loads them: restricted ptrace (yama scope 1), hidden kernel pointers, restricted dmesg, no core dumps from setuid programs, no ICMP redirects and source routing, SYN cookies and reverse path filtering. Undo it with Security - Remove Kernel Hardening. Settings that could break normal operation (such as disabling IP forwarding) are not changed.'
DEPENDENCIES=()
TAGS=(hardening kernel)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
f=/etc/sysctl.d/99-kookaburrow-hardening.conf
cat <<'EOS' | $SUDO tee "$f" >/dev/null
kernel.yama.ptrace_scope = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
EOS
$SUDO sysctl -p "$f" 2>&1 | head -n 20
echo "Hardening written to $f and applied."
exit 0
