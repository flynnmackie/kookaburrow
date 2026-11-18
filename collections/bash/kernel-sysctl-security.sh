NAME='Kernel - Hardening Settings'
DESCRIPTION='Kernel hardening sysctl values (ASLR, ptrace scope, kptr_restrict, perf and bpf restrictions, symlink and hardlink protection, module loading lock). Weak values ease privilege escalation.'
DEPENDENCIES=()
TAGS=(kernel security)

printf 'Setting\tValue\tComment\n'
for k in kernel.randomize_va_space kernel.yama.ptrace_scope kernel.kptr_restrict kernel.dmesg_restrict kernel.perf_event_paranoid kernel.unprivileged_bpf_disabled kernel.modules_disabled kernel.kexec_load_disabled kernel.sysrq kernel.core_uses_pid fs.protected_symlinks fs.protected_hardlinks fs.protected_regular fs.protected_fifos fs.suid_dumpable vm.mmap_min_addr user.max_user_namespaces kernel.unprivileged_userns_clone; do p="/proc/sys/$(echo "$k" | tr . /)"; [ -r "$p" ] && printf '%s\t%s\t\n' "$k" "$(cat "$p")"; done
exit 0
