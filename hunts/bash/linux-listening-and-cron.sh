NAME='Linux listeners and cron'
DESCRIPTION='Listening sockets and cron entries (Linux, run over SSH with bash).'
DEPENDENCIES=()
TAGS=(network listening persistence cron)

echo '== Listening sockets =='
ss -tulpn 2>&1
echo
echo '== System cron files =='
find /etc/cron* -type f 2>/dev/null
echo
echo '== Current user crontab =='
crontab -l 2>&1
