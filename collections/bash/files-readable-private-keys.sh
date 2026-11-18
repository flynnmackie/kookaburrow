NAME='Files - Readable Private Keys and Shadow Copies'
DESCRIPTION='Private keys and copies of passwd and shadow that other users can read, anywhere in home, backup and temp folders. A world-readable key or shadow backup gives away credentials.'
DEPENDENCIES=()
TAGS=(filesystem accounts security)

printf 'Path\tMode\tOwner\tKind\n'
for d in /home /root /tmp /var/tmp /var/backups /opt /srv /mnt; do [ -d "$d" ] && find "$d" -xdev -type f \( -name 'id_rsa' -o -name 'id_dsa' -o -name 'id_ecdsa' -o -name 'id_ed25519' -o -name '*.pem' -o -name '*.key' -o -name 'shadow*' -o -name 'passwd-' -o -name '*.p12' -o -name '*.pfx' \) -perm /044 -printf '%p\t%m\t%u\tworld or group readable\n' 2>/dev/null | head -n 50; done
exit 0
