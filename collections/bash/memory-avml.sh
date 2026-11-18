NAME='Memory - Full Dump'
DESCRIPTION='Acquires all physical memory (RAM) as a LiME-format image with AVML (Microsoft), for analysis with Volatility 3. Needs root or passwordless sudo, and the avml binary.'
DEPENDENCIES=(avml)
TAGS=(forensics malware processes)
FOOTPRINT='transient'
RETURNS='both'
TYPE='tool'
TRANSFER='large'
PRODUCES=(memory)

# $BIN_DIR holds avml (staged by Kookaburrow); $OUT_DIR is the folder that is pulled back afterwards and then removed.
SUDO=""
if [ "$(id -u)" != "0" ]; then
  if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "AVML needs root: log in as root, or use an account with passwordless sudo" >&2; exit 1; fi
fi
chmod +x "$BIN_DIR/avml" 2>/dev/null
ram_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
free_kb=$(df -Pk "$OUT_DIR" | awk 'NR==2{print $4}')
# the image is about the size of the RAM in use; AVML can compress with --compress but Volatility needs the plain image
[ "$free_kb" -gt $(( ram_kb + ram_kb / 20 )) ] || { echo "Not enough free disk space for the image: RAM is $(( ram_kb / 1048576 )) GB, $(( free_kb / 1048576 )) GB free on the host" >&2; exit 1; }
started=$(date +%s)
img="$OUT_DIR/memory.lime"
out=$($SUDO "$BIN_DIR/avml" "$img" 2>&1 </dev/null); rc=$?
$SUDO chown "$(id -u):$(id -g)" "$img" 2>/dev/null
[ -s "$img" ] || { echo "AVML produced no image (exit $rc): $out" | head -c 400 >&2; exit 1; }
# Volatility 3 needs the kernel's symbols: record the exact kernel so the right ISF can be found or built
{ uname -a; echo; cat /etc/os-release; echo; head -c 200 /proc/version; } > "$OUT_DIR/kernel-info.txt" 2>/dev/null
echo "Image: memory.lime"
echo "Size GB: $(awk -v b="$(stat -c %s "$img")" 'BEGIN{printf "%.2f", b/1073741824}')"
echo "RAM GB: $(awk -v k="$ram_kb" 'BEGIN{printf "%.2f", k/1048576}')"
echo "Kernel: $(uname -r)"
echo "Minutes: $(( ($(date +%s) - started) / 60 ))"
exit 0
