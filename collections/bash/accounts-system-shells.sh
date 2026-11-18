NAME='Accounts - System Accounts With Login Shells'
DESCRIPTION='Accounts with a UID below 1000 that have a real login shell or a home in an unusual place. Service accounts should not be able to log in.'
DEPENDENCIES=()
TAGS=(accounts persistence)

printf 'User\tUid\tShell\tHome\n'
getent passwd 2>/dev/null </dev/null | awk -F: 'BEGIN{OFS="\t"} $3>0 && $3<1000 && $7 !~ /(nologin|false|sync|shutdown|halt)$/ && $7!="" {print $1,$3,$7,$6}'
exit 0
