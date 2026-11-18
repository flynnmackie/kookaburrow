NAME='SSH - Host Keys and Their Age'
DESCRIPTION='The SSH server host keys with type, fingerprint and when they were created. A host key that changed recently, or keys shared with another machine, point at a rebuilt or cloned host.'
DEPENDENCIES=()
TAGS=(ssh forensics inventory)

printf 'File\tType\tFingerprint\tModified\n'
for f in /etc/ssh/ssh_host_*_key.pub; do [ -r "$f" ] && printf '%s\t%s\t%s\t%s\n' "$f" "$(ssh-keygen -lf "$f" 2>/dev/null </dev/null | awk '{print $4}')" "$(ssh-keygen -lf "$f" 2>/dev/null </dev/null | awk '{print $2}')" "$(date -r "${f%.pub}" '+%Y-%m-%d %H:%M' 2>/dev/null)"; done
exit 0
