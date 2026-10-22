NAME='Logins - History'
DESCRIPTION='Login history from wtmp and btmp: successful logins with source address and duration (last), failed logins (lastb), the last login of every account (lastlog) and who is on now. DAYS limits to the last N days (default 30). Shows when and from where accounts were used, and brute force attempts. Needs root, or an account with passwordless sudo, for failed logins.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(logons accounts brute-force)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-30}
case "$D" in ''|*[!0-9]*) D=30;; esac
echo "== Successful logins, last $D days (last -F) =="
last -F -s "-${D}days" -w 2>/dev/null | grep -v '^$' | head -n 500 || last -F -w 2>/dev/null | head -n 300
echo "== Failed logins (lastb) =="
$SUDO lastb -F -w 2>/dev/null | head -n 300
echo "== Last login per account (lastlog) =="
lastlog 2>/dev/null | grep -v 'Never logged in'
echo "== Logged in now =="
w 2>/dev/null
exit 0
