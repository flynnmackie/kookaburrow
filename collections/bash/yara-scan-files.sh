NAME='Yara - Scan Files'
DESCRIPTION='Scans files in a folder with YARA rules and returns the files that match and which rule matched. Choose the rules with YaraRule: the enabled rule files (the default), one rule file from the server (the built-in ones list every ELF or PE executable, packed programs, archives, secrets and more), or write your own. Needs the yara program uploaded on the Binaries page. SHA-256 is added when there are 500 matches or fewer.'
DEPENDENCIES=(yara kb-rules.yar)
PARAMETERS=(ScanPath Recurse? YaraRule?)
TAGS=(malware filesystem forensics)
FOOTPRINT='transient'
RETURNS='records'
TYPE='tool'

# $BIN_DIR holds yara and kb-rules.yar (staged by Kookaburrow and removed afterwards); $ScanPath, $Recurse and $YaraRule are set above.
chmod +x "$BIN_DIR/yara" 2>/dev/null
[ -n "$ScanPath" ] || { echo 'ScanPath is required' >&2; exit 1; }
flags="-w -N"
case "$Recurse" in n|N|no|No|NO|false|False|0) ;; *) flags="$flags -r";; esac
tmp=$(mktemp)
"$BIN_DIR/yara" $flags "$BIN_DIR/kb-rules.yar" "$ScanPath" 2>"$tmp.err" </dev/null | awk '{rule=$1; $1=""; sub(/^ /,""); print rule "\t" $0}' > "$tmp"
if grep -qi 'error' "$tmp.err" 2>/dev/null; then head -n 3 "$tmp.err" >&2; rm -f "$tmp" "$tmp.err"; exit 1; fi
n=$(wc -l < "$tmp")
printf 'Rule\tPath\tSha256\n'
if [ "$n" -eq 0 ]; then printf 'No YARA matches.\t\t\n'; else
  while IFS="$(printf '\t')" read -r rule path; do h=""; [ "$n" -le 500 ] && [ -f "$path" ] && h=$(sha256sum "$path" 2>/dev/null | cut -d' ' -f1); printf '%s\t%s\t%s\n' "$rule" "$path" "$h"; done < "$tmp"
fi
rm -f "$tmp" "$tmp.err"
exit 0
