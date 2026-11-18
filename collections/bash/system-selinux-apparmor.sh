NAME='System - SELinux and AppArmor'
DESCRIPTION='Mandatory access control status: SELinux mode and policy, AppArmor profiles and their modes. A permissive or disabled MAC removes a layer of containment.'
DEPENDENCIES=()
TAGS=(security system)

printf 'Item\tValue\n'
printf 'SELinux mode\t%s\n' "$(getenforce 2>/dev/null </dev/null || echo not installed)"
printf 'SELinux config\t%s\n' "$(grep -E '^SELINUX=' /etc/selinux/config 2>/dev/null)"
printf 'AppArmor enabled\t%s\n' "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || echo no)"
if command -v aa-status >/dev/null 2>&1; then aa-status 2>/dev/null </dev/null | grep -E 'profiles are (loaded|in enforce|in complain)|processes are' | while IFS= read -r l; do printf 'AppArmor\t%s\n' "$l"; done; fi
exit 0
