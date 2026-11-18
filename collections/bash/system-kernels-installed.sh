NAME='System - Installed Kernels and Boot Loader'
DESCRIPTION='Kernel images installed, the running kernel and the boot loader entries. An unexpected kernel or a boot loader without a password can matter.'
DEPENDENCIES=()
TAGS=(system persistence)

printf 'Item\tValue\n'
printf 'Running kernel\t%s\n' "$(uname -r)"
for f in /boot/vmlinuz-* /boot/vmlinux-*; do [ -e "$f" ] && printf 'Kernel image\t%s (%s)\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"; done
for f in /boot/grub/grub.cfg /boot/grub2/grub.cfg /boot/efi/EFI/*/grub.cfg; do [ -r "$f" ] && { printf 'grub config\t%s\n' "$f"; grep -E '^\s*(set superusers|password_pbkdf2|password )' "$f" 2>/dev/null | sed 's/\(password[^ ]* [^ ]*\) .*/\1 (hidden)/' | while IFS= read -r l; do printf 'grub password setting\t%s\n' "$l"; done; }; done
printf 'Kernel command line\t%s\n' "$(cat /proc/cmdline 2>/dev/null)"
exit 0
