NAME='Files - Package Integrity'
DESCRIPTION='Verifies installed files against what their packages shipped (dpkg --verify on Debian and Ubuntu, rpm -Va on Red Hat and SUSE) and lists files that were changed, which finds replaced system binaries and tampered configuration. Configuration files changed by an administrator also appear, so concentrate on binaries in /bin, /sbin, /usr/bin, /usr/sbin and libraries. Can take several minutes. Needs root, or an account with passwordless sudo.'
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
