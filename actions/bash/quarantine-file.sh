NAME='Quarantine file'
DESCRIPTION='Moves a file into /var/quarantine-kookaburrow with permissions removed, recording its SHA-256 first. The original is not deleted.'
DEPENDENCIES=()
PARAMETERS=(FILE_PATH)
TAGS=(filesystem malware containment)

[ -n "$FILE_PATH" ] || { echo "FILE_PATH is required" >&2; exit 2; }
[ -f "$FILE_PATH" ] || { echo "Not a regular file: $FILE_PATH" >&2; exit 1; }
dir=/var/quarantine-kookaburrow
mkdir -p "$dir" && chmod 700 "$dir"
sum=$(sha256sum -- "$FILE_PATH" | cut -d' ' -f1)
dest="$dir/$(date +%Y%m%d-%H%M%S)_$(basename -- "$FILE_PATH").quarantined"
mv -- "$FILE_PATH" "$dest" && chmod 000 "$dest"
echo "Quarantined $FILE_PATH"
echo "SHA256: $sum"
echo "Moved to: $dest"
