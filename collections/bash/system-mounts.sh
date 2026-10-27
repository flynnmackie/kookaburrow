NAME='System - Mounts and Disks'
DESCRIPTION='Mounted file systems with options, block devices, disk usage, fstab, loop and network mounts.'
DEPENDENCIES=()
TAGS=(inventory filesystem)

echo "== Mounts =="; findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS 2>/dev/null || mount
echo "== Block devices =="; lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL 2>/dev/null
echo "== Usage =="; df -hT 2>/dev/null
echo "== fstab =="; grep -v '^#' /etc/fstab 2>/dev/null | grep -v '^$'
echo "== Loop devices =="; losetup -a 2>/dev/null
echo "== Swap =="; cat /proc/swaps 2>/dev/null
exit 0
