NAME='Network - Packet Capture'
DESCRIPTION='Captures network traffic on all interfaces for a short time with tcpdump and brings back a pcap file for Wireshark. DURATION is the capture length in seconds (default 30, maximum 600). PORT limits the capture to one TCP or UDP port (for example 443 or 53) and ADDRESS to one IP address. Needs tcpdump installed on the host, and root or an account with passwordless sudo. The file comes back over SFTP.'
DEPENDENCIES=()
PARAMETERS=(DURATION? PORT? ADDRESS?)
TAGS=(network forensics c2)
FOOTPRINT='transient'
RETURNS='both'
TYPE='tool'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v tcpdump >/dev/null 2>&1 || { echo "tcpdump is not installed on this host" >&2; exit 1; }
S=${DURATION:-30}; case "$S" in ''|*[!0-9]*) S=30;; esac
[ "$S" -gt 600 ] && S=600
filter=()
case "$PORT" in ''|*[!0-9]*) ;; *) filter+=(port "$PORT");; esac
if echo "$ADDRESS" | grep -qE '^[0-9a-fA-F:.]+$'; then [ ${#filter[@]} -gt 0 ] && filter+=(and); filter+=(host "$ADDRESS"); fi
$SUDO timeout "$S" tcpdump -i any -nn -s 0 -w "$OUT_DIR/capture.pcap" "${filter[@]}" >/dev/null 2>&1
$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/capture.pcap" 2>/dev/null
[ -s "$OUT_DIR/capture.pcap" ] || { echo "no capture file was produced" >&2; exit 1; }
echo "captured for $S seconds: $(stat -c %s "$OUT_DIR/capture.pcap") bytes"
exit 0
