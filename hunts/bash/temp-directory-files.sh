NAME='Executables and hidden files in temp directories'
DESCRIPTION='Finds executable files, scripts and hidden entries in /tmp, /var/tmp and /dev/shm, plus world-writable directories elsewhere without the sticky bit. Attackers stage tools in these world-writable locations.'
DEPENDENCIES=()
TAGS=(malware filesystem execution)

dirs='/tmp /var/tmp /dev/shm'

echo '== Executable or script files (changed in the last 30 days) =='
# shellcheck disable=SC2086
find $dirs -type f \( -perm /111 -o -name '*.sh' -o -name '*.py' -o -name '*.pl' -o -name '*.elf' -o -name '*.so' \) -mtime -30 \
  -printf '%TY-%Tm-%Td %TH:%TM  %u  %m  %s bytes  %p\n' 2>/dev/null | sort -r | head -n 200
echo
echo '== SHA-256 of those executables (first 50) =='
# shellcheck disable=SC2086
find $dirs -type f -perm /111 -mtime -30 2>/dev/null | head -n 50 | while read -r f; do
  sha256sum "$f" 2>/dev/null
done
echo
echo '== Hidden files and directories =='
# shellcheck disable=SC2086
find $dirs -mindepth 1 -name '.*' -printf '%TY-%Tm-%Td %TH:%TM  %u  %p\n' 2>/dev/null | sort -r | head -n 100
echo
echo '== World-writable directories without the sticky bit (outside /proc and /sys) =='
find / -xdev -type d -perm -0002 ! -perm -1000 -not -path '/proc/*' -not -path '/sys/*' 2>/dev/null | head -n 100
