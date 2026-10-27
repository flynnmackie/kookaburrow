NAME='Files - Collect'
DESCRIPTION='Copies chosen files back to the server, keeping their folder structure. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(SOURCE_PATH RECURSE? MAX_FILE_MB? MODIFIED_DAYS?)
TAGS=(filesystem forensics malware)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
MX=${MAX_FILE_MB:-200}; case "$MX" in ''|*[!0-9]*) MX=200;; esac
args=(-type f -size "-$((MX * 1048576 + 1))c") # exact bytes: find rounds -size -NM up and would match only empty files
case "$MODIFIED_DAYS" in ''|*[!0-9]*) ;; *) args+=(-mtime "-$MODIFIED_DAYS");; esac
if [ -d "$SOURCE_PATH" ]; then case "$RECURSE" in y|yes|true|1) d=();; *) d=(-maxdepth 1);; esac; else d=(-maxdepth 0); fi
$SUDO test -e "$SOURCE_PATH" || { echo "no such path: $SOURCE_PATH" >&2; exit 1; }
echo "path	size	sha256	copied"
$SUDO find "$SOURCE_PATH" "${d[@]}" "${args[@]}" 2>/dev/null | while read -r f; do
  ok=no
  if $SUDO cp --parents -p "$f" "$OUT_DIR" 2>/dev/null; then ok=yes; fi
  printf '%s\t%s\t%s\t%s\n' "$f" "$($SUDO stat -c %s "$f" 2>/dev/null)" "$($SUDO sha256sum "$f" 2>/dev/null | cut -d' ' -f1)" "$ok"
done
$SUDO chown -R "$(id -u):$(id -g)" "$OUT_DIR" 2>/dev/null
exit 0
