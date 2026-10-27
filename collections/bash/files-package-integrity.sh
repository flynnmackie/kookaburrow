NAME='Files - Package Integrity'
DESCRIPTION='Verifies installed files against what their packages shipped. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(filesystem malware defense-evasion forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
if command -v dpkg >/dev/null 2>&1; then
  echo "== dpkg --verify (flags 5=checksum, S=size, M=mode, T=mtime) =="
  $SUDO dpkg --verify 2>/dev/null
elif command -v rpm >/dev/null 2>&1; then
  echo "== rpm -Va =="
  $SUDO rpm -Va 2>/dev/null
else
  echo "no supported package manager (dpkg or rpm) found"
fi
exit 0
