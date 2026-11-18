NAME='System - Virtualization and Container Detection'
DESCRIPTION='Whether the host is a virtual machine or a container, the hypervisor and the cloud provider. Explains hardware identity and what an attacker could escape to.'
DEPENDENCIES=()
TAGS=(inventory system containers)

printf 'Item\tValue\n'
printf 'systemd-detect-virt\t%s\n' "$(systemd-detect-virt 2>/dev/null </dev/null)"
printf 'DMI product\t%s\n' "$(cat /sys/class/dmi/id/product_name 2>/dev/null)"
printf 'DMI vendor\t%s\n' "$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)"
printf 'Hypervisor flag\t%s\n' "$(grep -c hypervisor /proc/cpuinfo 2>/dev/null)"
printf 'Container (cgroup)\t%s\n' "$(grep -qE 'docker|lxc|kubepods|containerd' /proc/1/cgroup 2>/dev/null && echo yes || echo no)"
printf '.dockerenv present\t%s\n' "$([ -e /.dockerenv ] && echo yes || echo no)"
exit 0
