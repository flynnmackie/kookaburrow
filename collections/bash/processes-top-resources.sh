NAME='Processes - Top CPU and Memory Users'
DESCRIPTION='The ten processes using most CPU and the ten using most memory, with the user and command. Cryptominers and runaway processes stand out.'
DEPENDENCIES=()
TAGS=(processes system)

printf 'Rank\tPid\tUser\tCpu\tMem\tCommand\n'
ps -eo pid=,user=,pcpu=,pmem=,args= --sort=-pcpu 2>/dev/null </dev/null | head -n 10 | awk 'BEGIN{OFS="\t"} {c=""; for(i=5;i<=NF;i++) c=c (i>5?" ":"") $i; print "cpu "NR,$1,$2,$3,$4,substr(c,1,160)}'
ps -eo pid=,user=,pcpu=,pmem=,args= --sort=-pmem 2>/dev/null </dev/null | head -n 10 | awk 'BEGIN{OFS="\t"} {c=""; for(i=5;i<=NF;i++) c=c (i>5?" ":"") $i; print "mem "NR,$1,$2,$3,$4,substr(c,1,160)}'
exit 0
