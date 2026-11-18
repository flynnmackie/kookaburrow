NAME='Security - SELinux Booleans and Contexts'
DESCRIPTION='SELinux booleans that are on and permissive domains. Booleans like httpd_can_network_connect or allow_execmem relax confinement for a service.'
DEPENDENCIES=()
TAGS=(security)

printf 'Setting\tValue\n'
command -v getsebool >/dev/null 2>&1 && getsebool -a 2>/dev/null </dev/null | grep -E '(httpd_can_network|httpd_execmem|allow_execmem|allow_execstack|ssh_sysadm|use_nfs_home|samba_enable_home|container_manage_cgroup|selinuxuser_execmod)' | sed 's/ --> /\t/'
command -v semanage >/dev/null 2>&1 && semanage permissive -l 2>/dev/null </dev/null | tail -n +2 | while IFS= read -r l; do printf 'permissive domain\t%s\n' "$l"; done
exit 0
