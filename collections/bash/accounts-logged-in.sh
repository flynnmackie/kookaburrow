NAME='Accounts - Logged In Now'
DESCRIPTION='Users logged in at this moment: terminal, source address, login time, idle time and the running command. Shows who is on the host while you are looking.'
DEPENDENCIES=()
TAGS=(accounts logons)

printf 'User\tTerminal\tFrom\tLoginTime\tIdle\tCommand\n'
w -h -i 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {cmd=""; for(i=8;i<=NF;i++) cmd=cmd (i>8?" ":"") $i; print $1,$2,$3,$4,$5,cmd}'
exit 0
