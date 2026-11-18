NAME='Packages - Trusted Repository Keys and Sources'
DESCRIPTION='The signing keys the package manager trusts and the repository sources, including unsigned or trusted=yes entries. A planted key or source lets an attacker deliver packages.'
DEPENDENCIES=()
TAGS=(packages persistence supply-chain)

printf 'Kind\tEntry\n'
for f in /etc/apt/trusted.gpg.d/* /usr/share/keyrings/* /etc/apt/keyrings/* /etc/pki/rpm-gpg/*; do [ -f "$f" ] && printf 'key file\t%s (%s)\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"; done
grep -hE '^(deb|deb-src) .*(trusted=yes|allow-insecure)' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null | while IFS= read -r l; do printf 'UNSIGNED source\t%s\n' "$l"; done
grep -hE '^(gpgcheck|sslverify)=0|^repo_gpgcheck=0' /etc/yum.repos.d/*.repo /etc/yum.conf /etc/dnf/dnf.conf 2>/dev/null | while IFS= read -r l; do printf 'Verification disabled\t%s\n' "$l"; done
exit 0
