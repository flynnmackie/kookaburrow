NAME='Accounts - Last Login per Account'
DESCRIPTION='When each account last logged in, from where and on which terminal (lastlog). Dormant accounts that suddenly log in, and accounts that never logged in but have a shell, stand out.'
DEPENDENCIES=()
TAGS=(accounts logons forensics)

printf 'User\tPort\tFrom\tLatest\n'
if command -v lastlog >/dev/null 2>&1; then lastlog 2>/dev/null </dev/null | awk 'NR>1 {u=$1; if ($0 ~ /Never logged in/) {print u"\t\t\tNever logged in"} else { port=$2; from=(NF>=8)?$3:""; ts=$0; sub(/^[^ ]+ +[^ ]+ +/,"",ts); if(from!="") sub(/^[^ ]+ +/,"",ts); print u"\t"port"\t"from"\t"ts }}' | sed 's/  */ /g'; fi
exit 0
