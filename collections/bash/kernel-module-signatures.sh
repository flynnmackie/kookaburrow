NAME='Kernel - Loaded Modules and Signatures'
DESCRIPTION='Each loaded kernel module with its file, size, who signed it and whether it is out of tree. Unsigned or out-of-tree modules are how rootkits load.'
DEPENDENCIES=()
TAGS=(kernel rootkit security)

printf 'Module\tSize\tFile\tSigner\tIntree\n'
lsmod 2>/dev/null </dev/null | awk 'NR>1{print $1"\t"$2}' | while IFS="$(printf '\t')" read -r m s; do i=$(modinfo "$m" 2>/dev/null </dev/null); printf '%s\t%s\t%s\t%s\t%s\n' "$m" "$s" "$(printf '%s\n' "$i" | awk '/^filename:/{print $2}')" "$(printf '%s\n' "$i" | awk -F: '/^signer:/{gsub(/^ +/,"",$2); print $2}')" "$(printf '%s\n' "$i" | awk '/^intree:/{print $2}')"; done
exit 0
