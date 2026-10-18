NAME='SUID and SGID binaries'
DESCRIPTION='Finds files with the setuid or setgid bit on the main filesystem and separately lists those outside the standard system directories. Unexpected SUID binaries are a common privilege escalation and persistence trick.'
DEPENDENCIES=()
TAGS=(privilege-escalation persistence filesystem)

all=$(find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -printf '%m %u:%g %TY-%Tm-%Td %p\n' 2>/dev/null | sort -k4)

echo '== Outside standard directories (investigate these first) =='
printf '%s\n' "$all" | grep -Ev ' /(usr/(bin|sbin|lib|lib64|libexec|local/bin)|bin|sbin|lib|lib64)/' || echo '(none)'
echo
echo "== All SUID/SGID files ($(printf '%s\n' "$all" | grep -c .) total, mode owner date path) =="
printf '%s\n' "$all"
