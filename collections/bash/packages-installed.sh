NAME='Packages - Installed'
DESCRIPTION='Every installed package with version and, where the package manager records it, the install date (dpkg, rpm and apk are supported). CONTAINS limits to package names containing that text. Look for attacker tools (nmap, netcat, tcpdump, compilers) and packages installed around the time of an incident.'
DEPENDENCIES=()
PARAMETERS=(CONTAINS?)
TAGS=(inventory software)

filter() { if [ -n "$CONTAINS" ]; then grep -i -- "$CONTAINS"; else cat; fi; }
if command -v dpkg-query >/dev/null 2>&1; then
  echo "== dpkg (name, version, architecture) =="
  dpkg-query -W -f='${Package}\t${Version}\t${Architecture}\n' 2>/dev/null | filter
  echo "== recent dpkg actions =="
  grep -h -E ' (install|upgrade|remove) ' /var/log/dpkg.log* 2>/dev/null | filter | tail -n 300
elif command -v rpm >/dev/null 2>&1; then
  echo "== rpm (name, version, installed) =="
  rpm -qa --qf '%{NAME}\t%{VERSION}-%{RELEASE}\t%{INSTALLTIME:date}\n' 2>/dev/null | filter | sort
elif command -v apk >/dev/null 2>&1; then
  echo "== apk =="
  apk info -v 2>/dev/null | filter
else
  echo "no supported package manager found"
fi
exit 0
