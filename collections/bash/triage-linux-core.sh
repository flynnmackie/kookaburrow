NAME='Triage - Linux Core'
DESCRIPTION='A native quick triage with no extra tools. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(DAYS?)
TAGS=(forensics triage filesystem)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
D=${DAYS:-7}; case "$D" in ''|*[!0-9]*) D=7;; esac
V="$OUT_DIR/volatile"; mkdir -p "$V"
grab() { name=$1; shift; { "$@" 2>&1; } > "$V/$name.txt"; printf '%s\t%s bytes\n' "$name" "$(stat -c %s "$V/$name.txt")"; }
echo "artefact	size"
grab uname uname -a
grab date date
grab uptime uptime
grab os-release cat /etc/os-release
grab processes ps -eo pid,ppid,user,lstart,etime,args --forest
grab sockets $SUDO ss -tunapl
grab who-last bash -c 'who -a; echo; last -F -n 200; echo; lastlog'
grab users getent passwd
grab groups getent group
grab mounts findmnt
grab interfaces bash -c 'ip -br addr; ip route; ip neigh'
grab firewall bash -c "$SUDO iptables-save; $SUDO nft list ruleset"
grab modules lsmod
grab cron bash -c 'for f in /etc/crontab /etc/cron.d/*; do echo "-- $f"; cat "$f"; done; for u in $(cut -d: -f1 /etc/passwd); do crontab -u "$u" -l 2>/dev/null | sed "s/^/$u: /"; done'
grab systemd-units systemctl list-units --all --no-pager
grab systemd-unit-files systemctl list-unit-files --no-pager
grab suid-files bash -c "$SUDO find / -xdev -perm -4000 -type f 2>/dev/null"
grab env env
# logs
mkdir -p "$OUT_DIR/logs"
list=$(mktemp); $SUDO find /var/log -type f -mtime "-$D" 2>/dev/null > "$list"
$SUDO tar czf "$OUT_DIR/logs/var-log.tgz" -T "$list" 2>/dev/null; rm -f "$list"
command -v journalctl >/dev/null 2>&1 && $SUDO journalctl --no-pager -o export --since "$D days ago" 2>/dev/null | gzip > "$OUT_DIR/logs/journal.export.gz"
# configuration and user evidence
$SUDO tar czf "$OUT_DIR/etc.tgz" --exclude='/etc/shadow*' --exclude='/etc/gshadow*' --exclude='/etc/ssl/private' /etc 2>/dev/null
ul=$(mktemp)
getent passwd | awk -F: '$6 != "" && $6 != "/" {print $6}' | sort -u | while read -r h; do for f in .bash_history .zsh_history .bashrc .profile .viminfo .ssh/authorized_keys .ssh/config .ssh/known_hosts; do $SUDO test -e "$h/$f" 2>/dev/null && echo "$h/$f"; done; done > "$ul"
$SUDO tar czf "$OUT_DIR/user-files.tgz" -T "$ul" 2>/dev/null; rm -f "$ul"
$SUDO chown -R "$(id -u):$(id -g)" "$OUT_DIR" 2>/dev/null
ls -l "$OUT_DIR" | tail -n +2 | awk '{print $9"\t"$5" bytes"}'
exit 0
