NAME='Logs - USB Devices Attached'
DESCRIPTION='USB devices seen by the kernel (vendor, product, serial) and storage devices mounted. Shows removable media and unexpected hardware.'
DEPENDENCIES=()
TAGS=(forensics inventory)

printf 'Time\tEvent\n'
( dmesg -T 2>/dev/null </dev/null || dmesg 2>/dev/null </dev/null ) | grep -iE 'usb [0-9]|usb-storage|new (full|high|low|super)-speed|Product:|Manufacturer:|SerialNumber:|Attached SCSI' | sed 's/^\[\(.*\)\] /\1\t/' | tail -n 150
command -v lsusb >/dev/null 2>&1 && lsusb 2>/dev/null </dev/null | while IFS= read -r l; do printf 'now\t%s\n' "$l"; done
exit 0
