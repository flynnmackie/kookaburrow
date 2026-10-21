NAME='System logs archive (large transfer)'
DESCRIPTION='Packs /var/log into one compressed archive and pulls it back to the server over SFTP, for offline analysis. Can be hundreds of MB. Needs root to read every log.'
DEPENDENCIES=()
TAGS=(forensics filesystem)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

# $OUT_DIR is the temporary folder on the host that Kookaburrow pulls back afterwards and then removes.
tar czf "$OUT_DIR/var-log.tgz" -C / var/log 2>/dev/null
[ -s "$OUT_DIR/var-log.tgz" ] || { echo "tar produced no archive" >&2; exit 1; }
ls -l "$OUT_DIR"
