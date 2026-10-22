NAME='Logins - Recent and Sudoers'
DESCRIPTION='Last logins, currently logged-in users and members of sudo/wheel/admin groups (Linux).'
DEPENDENCIES=()
TAGS=(accounts logons)

echo '== Currently logged in =='
who 2>&1
echo
echo '== Last 20 logins =='
last -n 20 2>&1
echo
echo '== Privileged group members =='
getent group sudo wheel admin 2>/dev/null
exit 0
