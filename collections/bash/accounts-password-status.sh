NAME='Accounts - Password Status'
DESCRIPTION='Password and account state for every account: locked, no password, password last changed, expiry, and whether the account has a login shell. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(accounts privilege-escalation persistence)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== account status (name state last-change min max warn inactive) =="
$SUDO passwd -S -a 2>/dev/null
echo "== UID 0 accounts =="
awk -F: '$3==0 {print $1" shell="$7}' /etc/passwd
echo "== Empty password fields =="
$SUDO awk -F: '$2=="" {print $1}' /etc/shadow 2>/dev/null
echo "== Accounts with a login shell =="
awk -F: '$7 !~ /(nologin|false|sync|shutdown|halt)$/ && $7 != "" {print $1" uid="$3" home="$6" shell="$7}' /etc/passwd
echo "== Accounts changed recently (passwd, shadow, group modified) =="
ls -l --time-style=long-iso /etc/passwd /etc/shadow /etc/group /etc/gshadow 2>/dev/null
exit 0
