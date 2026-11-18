NAME='Databases - Database Servers and Their Exposure'
DESCRIPTION='MySQL, MariaDB, PostgreSQL, MongoDB, Redis, Elasticsearch and others: whether they run, which address and port they listen on, and whether they bind beyond localhost.'
DEPENDENCIES=()
TAGS=(inventory network security)

printf 'Database\tRunning\tListening\n'
S=""; [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null </dev/null && S="sudo -n"
for p in mysqld mariadbd postgres mongod redis-server elasticsearch memcached couchdb influxd cassandra clickhouse-server; do if pgrep -x "$p" >/dev/null 2>&1; then l=$($S ss -tlnpH 2>/dev/null </dev/null | grep "\"$p\"" | awk '{print $4}' | tr '\n' ' '); printf '%s\tyes\t%s\n' "$p" "$l"; fi; done
exit 0
