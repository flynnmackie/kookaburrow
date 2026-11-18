NAME='Logs - Kernel Oops, Segfaults and OOM'
DESCRIPTION='Segmentation faults, kernel oops and out-of-memory kills from the kernel log. Exploitation attempts and unstable malware often crash first.'
DEPENDENCIES=()
TAGS=(forensics system)

( dmesg -T 2>/dev/null </dev/null || dmesg 2>/dev/null </dev/null ) | grep -iE 'segfault|general protection|Oops|BUG:|Out of memory|oom-kill|Killed process|call trace|kernel panic|ptrace|taint' | tail -n 200
command -v journalctl >/dev/null 2>&1 && journalctl -k --no-pager -o short-iso 2>/dev/null </dev/null | grep -iE 'segfault|Oops|BUG:|Out of memory|oom-kill|Killed process' | tail -n 100
exit 0
