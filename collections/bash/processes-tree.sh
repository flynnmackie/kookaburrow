NAME='Processes - Tree with Command Lines'
DESCRIPTION='Every process with its parent, owner, start time and full command line so parent and child relationships can be read.'
DEPENDENCIES=()
TAGS=(processes execution inventory)

printf 'Pid\tPpid\tUser\tStarted\tCommand\n'
ps -eo pid=,ppid=,user=,lstart=,args= --sort=pid 2>/dev/null </dev/null | awk 'BEGIN{OFS="\t"} {cmd=""; for(i=9;i<=NF;i++) cmd=cmd (i>9?" ":"") $i; print $1,$2,$3,$5" "$6" "$7" "$8" "$4,cmd}'
exit 0
