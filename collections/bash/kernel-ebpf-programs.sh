NAME='Kernel - eBPF Programs'
DESCRIPTION='eBPF programs, maps and attachments loaded into the kernel (bpftool), pinned objects under /sys/fs/bpf, and kprobe and uprobe tracing events. Modern Linux rootkits and some security tools use eBPF to hide processes, files and connections or to capture traffic. Compare against what your security tooling is expected to load. Needs bpftool for detail, and root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(rootkit kernel malware defense-evasion)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
if command -v bpftool >/dev/null 2>&1; then
  echo "== bpftool prog =="; $SUDO bpftool prog show 2>&1
  echo "== bpftool map =="; $SUDO bpftool map show 2>&1 | head -n 60
  echo "== attachments (net, cgroup, perf) =="; $SUDO bpftool net show 2>&1; $SUDO bpftool cgroup tree 2>&1 | head -n 40; $SUDO bpftool perf show 2>&1
else
  echo "bpftool is not installed; showing what the file system exposes"
fi
echo "== Pinned objects =="; $SUDO ls -lR /sys/fs/bpf 2>/dev/null | head -n 60
echo "== kprobes / uprobes =="; $SUDO cat /sys/kernel/debug/tracing/kprobe_events /sys/kernel/debug/tracing/uprobe_events 2>/dev/null
echo "== unprivileged bpf =="; sysctl kernel.unprivileged_bpf_disabled 2>/dev/null
echo "== processes holding bpf file descriptors =="
for p in /proc/[0-9]*; do $SUDO ls -l "$p/fd" 2>/dev/null | grep -q 'anon_inode:bpf' && echo "pid ${p#/proc/}: $(cat "$p/comm" 2>/dev/null)"; done
exit 0
