NAME='UAC IR triage (large transfer)'
DESCRIPTION='Runs UAC (Unix-like Artifacts Collector) with the ir_triage profile on the host: live response data, system and user artefacts, logs and configuration, as one tar.gz plus the UAC log and hash file. Everything comes back as raw files over SFTP and is then removed from the host. Needs uac.tar.gz: the UAC release tarball (for example uac-3.x.x.tar.gz from the UAC GitHub releases page, uploaded under the name uac.tar.gz). Needs root, or an account with passwordless sudo. Can take a while and produce hundreds of MB.'
DEPENDENCIES=(uac.tar.gz)
TAGS=(forensics triage filesystem)
FOOTPRINT='transient'
RETURNS='both'
TYPE='tool'
TRANSFER='large'

# $BIN_DIR holds uac.tar.gz (staged by Kookaburrow); $OUT_DIR is the folder that is pulled back afterwards and then removed.
started=$(date +%s)

SUDO=""
if [ "$(id -u)" != "0" ]; then
  if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "UAC needs root: log in as root, or use an account with passwordless sudo" >&2; exit 1; fi
fi

# 1. unpack UAC next to the staged tarball (the whole $BIN_DIR folder is deleted when the run ends)
work="$BIN_DIR/uac-unpacked"
mkdir -p "$work"
tar -xzf "$BIN_DIR/uac.tar.gz" -C "$work" || { echo "uac.tar.gz could not be unpacked" >&2; exit 1; }
uac=$(find "$work" -maxdepth 3 -type f -name uac | head -n 1)
[ -n "$uac" ] || { echo "uac.tar.gz does not contain the uac script" >&2; exit 1; }
chmod -R u+x "$(dirname "$uac")"

# 2. run the ir_triage profile, writing into the folder that is pulled back
$SUDO "$uac" -p ir_triage "$OUT_DIR" > "$OUT_DIR/uac-console.log" 2>&1
uac_exit=$?
# UAC runs as root, so what it wrote belongs to root: hand it to the account Kookaburrow uses so it can be read and removed
$SUDO chown -R "$(id -u):$(id -g)" "$OUT_DIR"
archive=$(find "$OUT_DIR" -maxdepth 1 -type f -name 'uac-*.tar.gz' | head -n 1)
[ -n "$archive" ] || { echo "UAC produced no archive (exit code $uac_exit); see uac-console.log" >&2; tail -n 5 "$OUT_DIR/uac-console.log" >&2; exit 1; }

# what comes back as text
echo "Archive: $(basename "$archive")"
echo "Archive size MB: $(( $(stat -c %s "$archive") / 1048576 ))"
echo "Profile: ir_triage"
echo "UAC exit code: $uac_exit"
echo "Minutes: $(( ($(date +%s) - started) / 60 ))"
