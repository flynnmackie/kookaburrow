NAME='Kernel - Network Sysctl Settings'
DESCRIPTION='Network related kernel settings: forwarding, redirects, source routing, reverse path filtering, SYN cookies. They show whether the host can route or is hardened.'
DEPENDENCIES=()
TAGS=(security network kernel)

printf 'Setting\tValue\n'
for k in net.ipv4.ip_forward net.ipv6.conf.all.forwarding net.ipv4.conf.all.accept_redirects net.ipv4.conf.all.send_redirects net.ipv4.conf.all.accept_source_route net.ipv4.conf.all.rp_filter net.ipv4.tcp_syncookies net.ipv4.icmp_echo_ignore_broadcasts net.ipv4.conf.all.log_martians net.core.bpf_jit_enable kernel.unprivileged_bpf_disabled kernel.kptr_restrict kernel.dmesg_restrict kernel.yama.ptrace_scope kernel.randomize_va_space; do p="/proc/sys/$(echo "$k" | tr . /)"; printf '%s\t%s\n' "$k" "$(cat "$p" 2>/dev/null)"; done
exit 0
