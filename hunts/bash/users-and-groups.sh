NAME='Users, UID 0 accounts and privileged groups'
DESCRIPTION='Lists accounts with UID 0, accounts that have a login shell, members of privileged groups (sudo, wheel, admin, docker, lxd) and accounts with an empty password field. Unexpected UID 0 accounts and extra sudoers are classic persistence.'
DEPENDENCIES=()
TAGS=(accounts persistence privilege-escalation)

echo '== Accounts with UID 0 =='
awk -F: '$3 == 0 {print $1}' /etc/passwd
echo
echo '== Accounts with a login shell (user:uid:home:shell) =='
awk -F: '$7 !~ /(nologin|false|sync|shutdown|halt)$/ {print $1":"$3":"$6":"$7}' /etc/passwd
echo
echo '== Privileged group members =='
getent group sudo wheel admin docker lxd 2>/dev/null
echo
echo '== Accounts with an empty password field =='
if [ -r /etc/shadow ]; then
  awk -F: '$2 == "" {print $1}' /etc/shadow
else
  echo '(/etc/shadow not readable: run as root for this check)'
fi
echo
echo '== sudoers entries (non-comment) =='
cat /etc/sudoers /etc/sudoers.d/* 2>/dev/null | grep -Ev '^\s*(#|$)'
