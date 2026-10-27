NAME='Config - Collect Etc'
DESCRIPTION='Collects the /etc configuration folder as a compressed archive for offline review. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(INCLUDE_SHADOW?)
TAGS=(forensics persistence filesystem)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
ex=(--exclude='/etc/shadow*' --exclude='/etc/gshadow*' --exclude='/etc/ssl/private')
case "$INCLUDE_SHADOW" in y|yes|true|1) ex=();; esac
$SUDO tar czf "$OUT_DIR/etc.tgz" "${ex[@]}" /etc 2>/dev/null
$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/etc.tgz" 2>/dev/null
[ -s "$OUT_DIR/etc.tgz" ] || { echo "could not create the archive" >&2; exit 1; }
ls -l "$OUT_DIR"
exit 0
