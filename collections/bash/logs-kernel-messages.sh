NAME='Logs - Kernel Messages'
DESCRIPTION='The kernel ring buffer with readable times, highlighting events that matter in an investigation. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(CONTAINS?)
TAGS=(event-logs forensics kernel)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
all=$($SUDO dmesg -T 2>/dev/null || $SUDO dmesg 2>/dev/null)
echo "== Notable kernel events =="
printf '%s\n' "$all" | grep -iE 'usb [0-9-]+:.*(New USB device|Product|Manufacturer|SerialNumber)|module|segfault|general protection|Out of memory|Killed process|ptrace|audit.*denied|apparmor="DENIED"|DROP|IN=.*OUT=|link (up|down)|promiscuous' | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | tail -n 400
echo "== Last 100 kernel messages =="
printf '%s\n' "$all" | tail -n 100
exit 0
