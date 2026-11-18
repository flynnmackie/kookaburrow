NAME='SSH - Authorized Key Fingerprints'
DESCRIPTION='Each authorized key with its fingerprint, type, comment and options (command=, from=), for every user. Fingerprints can be matched across hosts to find a shared or stolen key.'
DEPENDENCIES=()
TAGS=(ssh accounts persistence)

printf 'User\tFile\tType\tFingerprint\tComment\tOptions\n'
getent passwd 2>/dev/null </dev/null | awk -F: '{print $1"\t"$6}' | while IFS="$(printf '\t')" read -r u h; do for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do [ -r "$f" ] || continue; grep -vE '^\s*(#|$)' "$f" 2>/dev/null | while IFS= read -r l; do fp=$(printf '%s\n' "$l" | ssh-keygen -lf - 2>/dev/null </dev/null | awk '{print $2"\t"$4}'); opt=""; case "$l" in ssh-*|ecdsa-*|sk-*) ;; *) opt=$(printf '%s' "$l" | sed 's/ \(ssh-\|ecdsa-\|sk-\).*//' | cut -c1-80);; esac; typ=$(printf '%s\n' "$l" | grep -oE '(ssh-(rsa|ed25519|dss)|ecdsa-sha2-[a-z0-9]+|sk-[a-z0-9@.-]+)' | head -n1); printf '%s\t%s\t%s\t%s\t%s\n' "$u" "$f" "$typ" "$(echo "$fp" | cut -f1)" "$(echo "$fp" | cut -f2)" | sed "s/\$/\t$opt/"; done; done; done
exit 0
