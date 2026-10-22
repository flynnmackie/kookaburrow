NAME='Packages - Recent'
DESCRIPTION='Lists the most recently installed or changed packages from the package manager (rpm, dpkg or apk). New tooling such as scanners, compilers and tunnelling software is worth reviewing after a suspected compromise.'
DEPENDENCIES=()
TAGS=(inventory software forensics)

if command -v rpm >/dev/null 2>&1; then
  echo '== rpm: 40 most recently installed packages =='
  rpm -qa --last 2>/dev/null | head -n 40
elif command -v dpkg >/dev/null 2>&1; then
  echo '== dpkg: recent installs (from dpkg.log) =='
  cat /var/log/dpkg.log /var/log/dpkg.log.1 2>/dev/null | grep -E ' install ' | tail -n 40
  zcat /var/log/dpkg.log.*.gz 2>/dev/null | grep -E ' install ' | tail -n 20
  echo
  echo '== apt history (last entries) =='
  grep -E '^(Start-Date|Commandline)' /var/log/apt/history.log 2>/dev/null | tail -n 40
elif command -v apk >/dev/null 2>&1; then
  echo '== apk: installed packages =='
  apk info -v 2>/dev/null | tail -n 40
else
  echo '(no supported package manager found)'
fi
exit 0
