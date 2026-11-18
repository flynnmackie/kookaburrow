NAME='Network - NFS Exports and Samba Shares'
DESCRIPTION='Directories this host shares over NFS and Samba and how (read/write, no_root_squash, guest access). Open shares are a data theft and lateral movement route.'
DEPENDENCIES=()
TAGS=(network smb lateral-movement)

printf 'Kind\tEntry\n'
[ -r /etc/exports ] && grep -vE '^\s*(#|$)' /etc/exports 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'NFS export\t%s\n' "$l"; done
for f in /etc/exports.d/*.exports; do [ -r "$f" ] && grep -vE '^\s*(#|$)' "$f" 2>/dev/null | while IFS= read -r l; do printf 'NFS export\t%s\n' "$l"; done; done
[ -r /etc/samba/smb.conf ] && grep -E '^\s*(\[|path|guest ok|public|read only|writable|browseable|valid users|map to guest|security)' /etc/samba/smb.conf 2>/dev/null | sed 's/^\s*//' | while IFS= read -r l; do printf 'Samba\t%s\n' "$l"; done
exit 0
