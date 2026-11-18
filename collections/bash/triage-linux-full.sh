NAME='Triage - Linux Full'
DESCRIPTION='A full live-response triage in the style of UAC, with no tool to upload: processes (with the hash of every running program), network, users, persistence, packages, containers, logs, user files and a timeline bodyfile, all hashed. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(DAYS? BODYFILE? HASH?)
TAGS=(forensics triage filesystem persistence network)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

# DAYS      how many days of logs and recently changed files to collect (default 14, 1 to 365)
# BODYFILE  yes (default) or no: a mactime-style timeline of every file (find / -xdev). The slowest part; turn off for a quick run.
# HASH      yes (default) or no: SHA-256 of every running program and of the program files in the usual places
# Everything lands in $OUT_DIR, which Kookaburrow pulls back and then removes. The host is not changed.

started=$(date +%s)
SUDO=""
if [ "$(id -u)" != "0" ]; then
  if sudo -n true 2>/dev/null; then SUDO="sudo -n"; else echo "This collection needs root: log in as root, or use an account with passwordless sudo" >&2; exit 1; fi
fi
D=${DAYS:-14}; case "$D" in ''|*[!0-9]*) D=14;; esac; [ "$D" -lt 1 ] && D=1; [ "$D" -gt 365 ] && D=365
case "$BODYFILE" in no|NO|No|false|0) DO_BODY=0;; *) DO_BODY=1;; esac
case "$HASH" in no|NO|No|false|0) DO_HASH=0;; *) DO_HASH=1;; esac
T=""; command -v timeout >/dev/null 2>&1 && T="timeout 300"
have() { command -v "$1" >/dev/null 2>&1; }
SHA=""; have sha256sum && SHA="sha256sum"; [ -z "$SHA" ] && have shasum && SHA="shasum -a 256"

L="$OUT_DIR/live_response"; ERR="$OUT_DIR/collection-errors.log"
mkdir -p "$L/system" "$L/process" "$L/network" "$L/storage" "$L/hardware" "$L/packages" "$L/containers" "$L/users" "$L/persistence" "$L/suspicious" "$OUT_DIR/files"
: > "$ERR"

# Every command gets </dev/null: this script is piped to bash, so anything that read stdin would swallow the rest of the script.
# cap NAME COMMAND...   runs the command (as root where it can), keeps stdout and stderr in <dir>/NAME.txt; the dir is the value of $dir
# only a command that ran out of time is worth a note: other non-zero exits are normal (a tool that is not installed, grep with no match)
note() { [ "$2" = 124 ] && echo "$1: stopped after 300 seconds, the output is incomplete" >> "$ERR"; }
dir="$L/system"
cap() { name=$1; shift; { echo "# $*"; echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ)"; $T "$@" 2>&1 </dev/null; } > "$dir/$name.txt" || note $name $?; }
# capsh NAME 'shell snippet'   the same for a snippet that needs pipes; $SUDO is available inside it
capsh() { name=$1; shift; { echo "# $*"; echo "# $(date -u +%Y-%m-%dT%H:%M:%SZ)"; $T bash -c "SUDO='$SUDO'; $1" 2>&1 </dev/null; } > "$dir/$name.txt" || note $name $?; }

# ---- system ----
dir="$L/system"
cap date date -u; cap uname uname -a; cap uptime uptime; cap hostname hostname
cap os-release cat /etc/os-release
capsh timezone 'timedatectl 2>/dev/null; echo; cat /etc/timezone 2>/dev/null; ls -l /etc/localtime'
capsh environment 'env'
capsh kernel-cmdline 'cat /proc/cmdline; echo; sysctl -a 2>/dev/null | head -n 2000'
capsh kernel-modules 'lsmod; echo; for m in $(lsmod | awk "NR>1{print \$1}"); do echo "-- $m"; modinfo "$m" 2>/dev/null | grep -E "^(filename|version|signer|sig_id|intree|taint)"; done'
capsh tainted 'cat /proc/sys/kernel/tainted; echo; dmesg 2>/dev/null | tail -n 300'
capsh selinux-apparmor 'getenforce 2>/dev/null; sestatus 2>/dev/null; aa-status 2>/dev/null'
capsh systemd-units 'systemctl list-units --all --no-pager 2>&1; echo; systemctl list-unit-files --no-pager 2>&1; echo; systemctl list-timers --all --no-pager 2>&1'
capsh services-init 'service --status-all 2>&1; chkconfig --list 2>&1; ls -l /etc/init.d /etc/rc*.d 2>&1'
capsh loaded-ld 'cat /etc/ld.so.preload 2>&1; echo; echo "LD_PRELOAD in running processes:"; for p in /proc/[0-9]*; do tr "\0" "\n" < $p/environ 2>/dev/null | grep -qE "^LD_(PRELOAD|LIBRARY_PATH)=" && echo "$p $(cat $p/comm 2>/dev/null)"; done'
capsh sysctl-security 'sysctl kernel.randomize_va_space kernel.yama.ptrace_scope kernel.kptr_restrict kernel.dmesg_restrict kernel.modules_disabled net.ipv4.ip_forward net.ipv4.conf.all.rp_filter fs.suid_dumpable 2>&1'

# ---- processes ----
dir="$L/process"
cap ps-forest ps -eo pid,ppid,pgid,sid,user,tty,stat,lstart,etime,args --forest
cap ps-full ps -eo pid,ppid,uid,euid,gid,user,stat,nlwp,pcpu,pmem,rss,vsz,lstart,comm,args
capsh pstree 'pstree -alp 2>/dev/null || pstree -p 2>/dev/null'
capsh lsof '$SUDO lsof -nP -w 2>/dev/null | head -n 200000'
capsh lsof-network '$SUDO lsof -nP -w -i 2>/dev/null'
capsh lsof-deleted '$SUDO lsof -nP -w +L1 2>/dev/null'
# per process: command line, working directory, executable, status and open files (reads /proc, so it works without lsof)
{
  echo "pid,ppid,uid,exe,exe_deleted,cwd,comm,cmdline"
  for p in /proc/[0-9]*; do
    pid=${p#/proc/}
    exe=$($SUDO readlink "$p/exe" 2>/dev/null); cwd=$($SUDO readlink "$p/cwd" 2>/dev/null)
    deleted=no; case "$exe" in *"(deleted)") deleted=yes;; esac
    ppid=$(awk '/^PPid:/{print $2}' "$p/status" 2>/dev/null); uid=$(awk '/^Uid:/{print $2}' "$p/status" 2>/dev/null)
    comm=$(cat "$p/comm" 2>/dev/null); cmd=$($SUDO tr '\0' ' ' < "$p/cmdline" 2>/dev/null | sed 's/"/""/g')
    printf '%s,%s,%s,"%s",%s,"%s","%s","%s"\n' "$pid" "$ppid" "$uid" "$exe" "$deleted" "$cwd" "$comm" "$cmd"
  done
} > "$L/process/proc-summary.csv" 2>>"$ERR"
mkdir -p "$L/process/proc"
for p in /proc/[0-9]*; do
  pid=${p#/proc/}; o="$L/process/proc/$pid"; mkdir -p "$o"
  $SUDO cat "$p/status" > "$o/status.txt" 2>/dev/null
  $SUDO tr '\0' ' ' < "$p/cmdline" > "$o/cmdline.txt" 2>/dev/null
  $SUDO ls -l "$p/fd" > "$o/fd.txt" 2>/dev/null
  $SUDO cat "$p/maps" > "$o/maps.txt" 2>/dev/null
  $SUDO cat "$p/cgroup" > "$o/cgroup.txt" 2>/dev/null
  $SUDO cat "$p/mountinfo" > "$o/mountinfo.txt" 2>/dev/null
  { $SUDO readlink "$p/exe"; $SUDO readlink "$p/cwd"; $SUDO readlink "$p/root"; } > "$o/links.txt" 2>/dev/null
  [ -s "$o/status.txt" ] || rm -rf "$o"
done
# programs with no file on disk, and processes whose name differs from the program (a hidden-process check: pids visible in /proc but not in ps)
capsh hidden-pids 'ps -e -o pid= | tr -d " " | sort -n > /tmp/.kb-ps.$$; ls /proc | grep -E "^[0-9]+$" | sort -n > /tmp/.kb-proc.$$; echo "in /proc but not in ps:"; comm -13 /tmp/.kb-ps.$$ /tmp/.kb-proc.$$; rm -f /tmp/.kb-ps.$$ /tmp/.kb-proc.$$'
capsh deleted-executables 'for p in /proc/[0-9]*; do e=$($SUDO readlink $p/exe 2>/dev/null); case "$e" in *"(deleted)") echo "${p#/proc/} $e $(tr "\0" " " < $p/cmdline 2>/dev/null)";; esac; done'

# ---- network ----
dir="$L/network"
capsh sockets '$SUDO ss -tunapeo 2>&1 || $SUDO netstat -tunap 2>&1'
capsh listening '$SUDO ss -tulnpe 2>&1 || $SUDO netstat -tulnp 2>&1'
capsh unix-sockets '$SUDO ss -xap 2>&1 | head -n 5000'
capsh raw-packet-sockets '$SUDO ss -wap 2>&1; echo; cat /proc/net/packet 2>&1'
capsh interfaces 'ip -s addr 2>&1 || ifconfig -a 2>&1; echo; ip link show 2>&1'
capsh routes-arp 'ip route show table all 2>&1; echo; ip -6 route 2>&1; echo; ip neigh 2>&1 || arp -an 2>&1; echo; ip rule 2>&1'
capsh firewall '$SUDO iptables-save 2>&1; echo; $SUDO ip6tables-save 2>&1; echo; $SUDO nft list ruleset 2>&1; echo; $SUDO ufw status verbose 2>&1; echo; $SUDO firewall-cmd --list-all 2>&1'
capsh dns-hosts 'cat /etc/resolv.conf 2>&1; echo; cat /etc/hosts 2>&1; echo; cat /etc/nsswitch.conf 2>&1; echo; resolvectl status 2>&1 | head -n 80'
capsh netns-tunnels 'ip netns list 2>&1; ip tunnel show 2>&1; ip -d link show type wireguard 2>&1; ls /etc/wireguard /etc/openvpn 2>&1'
capsh proc-net 'for f in tcp tcp6 udp udp6 raw raw6 unix; do echo "== /proc/net/$f"; cat /proc/net/$f 2>&1; done'
capsh ssh-connections 'who -a; echo; ss -tnp 2>/dev/null | grep -E ":22\b"'

# ---- users and logons ----
dir="$L/users"
capsh accounts 'echo "== passwd"; cat /etc/passwd; echo "== group"; cat /etc/group; echo "== accounts with uid 0"; awk -F: "\$3==0" /etc/passwd; echo "== accounts with a login shell"; grep -vE "(nologin|false|sync|shutdown|halt)$" /etc/passwd'
capsh password-status '$SUDO passwd -S -a 2>&1 | head -n 500; echo; $SUDO chage -l root 2>&1'
capsh sudoers '$SUDO sh -c "cat /etc/sudoers; for f in /etc/sudoers.d/*; do echo \"-- \$f\"; cat \$f; done" 2>&1'
capsh logons 'who -a; echo; w; echo; last -F -n 300; echo; lastb -F -n 100 2>&1; echo; lastlog 2>&1'
capsh ssh-authorized-keys 'for h in $(getent passwd | cut -d: -f6 | sort -u); do for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do [ -f "$f" ] && { echo "== $f"; $SUDO cat "$f"; }; done; done'
capsh cron 'for f in /etc/crontab /etc/cron.d/* /etc/cron.hourly/* /etc/cron.daily/* /etc/cron.weekly/* /etc/cron.monthly/* /etc/anacrontab; do [ -f "$f" ] && { echo "== $f"; cat "$f"; }; done; echo "== user crontabs"; for u in $(cut -d: -f1 /etc/passwd); do $SUDO crontab -u "$u" -l 2>/dev/null | sed "s/^/$u: /"; done; echo "== at jobs"; $SUDO atq 2>&1'

# ---- storage, hardware, packages, containers ----
dir="$L/storage"
cap df df -hT; cap mounts findmnt; cap lsblk lsblk -f; capsh partitions 'fdisk -l 2>&1; blkid 2>&1'; capsh open-mounts 'cat /proc/mounts; echo; cat /etc/fstab'
capsh usb-devices 'lsusb 2>&1; ls /dev/disk/by-id 2>&1'
dir="$L/hardware"
capsh cpu-memory 'lscpu 2>&1; echo; free -m 2>&1; echo; head -n 20 /proc/meminfo'
capsh dmi 'dmidecode -t system 2>&1 | head -n 60'
dir="$L/packages"
capsh dpkg 'dpkg -l 2>&1; echo; grep -E " (install|upgrade|remove|purge) " /var/log/dpkg.log* 2>/dev/null | tail -n 3000'
capsh rpm 'rpm -qa --last 2>&1 | head -n 5000'
capsh apk-pacman 'apk info -v 2>&1; pacman -Q 2>&1'
capsh repositories 'cat /etc/apt/sources.list /etc/apt/sources.list.d/* 2>&1; ls /etc/yum.repos.d 2>&1; cat /etc/yum.repos.d/* 2>&1'
capsh snap-flatpak 'snap list 2>&1; flatpak list 2>&1'
capsh language-packages 'pip list 2>&1 | head -n 500; pip3 list 2>&1 | head -n 500; npm ls -g --depth=0 2>&1'
dir="$L/containers"
capsh docker 'docker ps -a --no-trunc 2>&1; echo; docker images --digests 2>&1; echo; docker network ls 2>&1; echo; docker volume ls 2>&1; echo; docker info 2>&1 | head -n 80'
capsh docker-inspect 'for c in $(docker ps -aq 2>/dev/null); do docker inspect "$c" 2>/dev/null; done'
capsh podman-lxc 'podman ps -a 2>&1; lxc list 2>&1; crictl ps -a 2>&1; kubectl get pods -A 2>&1 | head -n 200'

# ---- persistence ----
dir="$L/persistence"
capsh startup-files 'for f in /etc/rc.local /etc/profile /etc/bash.bashrc /etc/bashrc /etc/environment /etc/ld.so.conf /etc/ld.so.conf.d/* /etc/profile.d/* /etc/pam.d/* /etc/xdg/autostart/*; do [ -f "$f" ] && { echo "== $f"; cat "$f"; }; done'
capsh systemd-files 'for d in /etc/systemd/system /usr/lib/systemd/system /lib/systemd/system /run/systemd/system /etc/systemd/user /usr/lib/systemd/user; do [ -d "$d" ] && find "$d" -type f -newermt "-$D days" -exec sh -c "echo \"== {}\"; cat \"{}\"" \; 2>/dev/null; done; echo "== unit files changed in the last $D days are listed above; all service units: "; find /etc/systemd/system -maxdepth 2 \( -type f -o -type l \) -exec ls -l {} \; 2>/dev/null'
capsh user-startup 'for h in $(getent passwd | cut -d: -f6 | sort -u); do for f in .bashrc .bash_profile .bash_login .profile .zshrc .zprofile .config/autostart .config/systemd/user; do [ -e "$h/$f" ] && { echo "== $h/$f"; $SUDO ls -la "$h/$f"; [ -f "$h/$f" ] && $SUDO cat "$h/$f"; }; done; done'
capsh kernel-persistence 'cat /etc/modules 2>&1; ls -l /etc/modules-load.d /etc/modprobe.d 2>&1; cat /etc/modules-load.d/* /etc/modprobe.d/* 2>&1; echo; ls -l /etc/udev/rules.d 2>&1; cat /etc/udev/rules.d/* 2>&1'
capsh motd-and-login-hooks 'ls -l /etc/update-motd.d /etc/network/if-up.d /etc/network/if-pre-up.d /etc/NetworkManager/dispatcher.d 2>&1'

# ---- suspicious files ----
dir="$L/suspicious"
capsh suid-sgid '$SUDO find / -xdev \( -perm -4000 -o -perm -2000 \) -type f -exec ls -l {} \; 2>/dev/null'
capsh world-writable '$SUDO find / -xdev -type f -perm -0002 -not -path "/proc/*" -not -path "/sys/*" -exec ls -l {} \; 2>/dev/null | head -n 5000; echo "-- directories without the sticky bit:"; $SUDO find / -xdev -type d -perm -0002 ! -perm -1000 2>/dev/null | head -n 1000'
capsh no-owner '$SUDO find / -xdev \( -nouser -o -nogroup \) -exec ls -ld {} \; 2>/dev/null | head -n 2000'
capsh capabilities '$SUDO find / -xdev -type f -exec getcap {} + 2>/dev/null'
capsh hidden-files '$SUDO find / -xdev \( -path /proc -o -path /sys \) -prune -o -name ".*" -type f \( -path "/tmp/*" -o -path "/var/tmp/*" -o -path "/dev/shm/*" -o -path "/usr/*" -o -path "/etc/*" -o -path "/var/www/*" \) -exec ls -l {} \; 2>/dev/null | head -n 5000'
capsh temp-executables '$SUDO find /tmp /var/tmp /dev/shm /run /var/run -xdev -type f \( -perm -u+x -o -perm -g+x -o -perm -o+x \) -exec ls -l {} \; 2>/dev/null; echo "-- ELF files in temp folders:"; $SUDO find /tmp /var/tmp /dev/shm -xdev -type f -exec sh -c "head -c 4 \"\$1\" 2>/dev/null | grep -q ELF && echo \"\$1\"" _ {} \; 2>/dev/null'
capsh recently-changed "\$SUDO find / -xdev \\( -path /proc -o -path /sys -o -path /var/lib/docker \\) -prune -o -type f -mtime -$D -not -path '/var/log/*' -exec ls -l --time-style=full-iso {} \\; 2>/dev/null | head -n 20000"
capsh recently-changed-config "\$SUDO find /etc /usr/bin /usr/sbin /usr/local /bin /sbin /lib /lib64 /opt /root /home /var/spool -xdev -type f -ctime -$D -exec ls -l --time-style=full-iso {} \\; 2>/dev/null | head -n 20000"
capsh web-shell-candidates '$SUDO grep -rIlE "(eval|assert|system|passthru|shell_exec|exec)\s*\(\s*(base64_decode|\$_(GET|POST|REQUEST|COOKIE))" /var/www /srv /usr/share/nginx /opt 2>/dev/null | head -n 500'
capsh shell-history-large 'for h in $(getent passwd | cut -d: -f6 | sort -u); do for f in .bash_history .zsh_history .sh_history .python_history .mysql_history .lesshst .viminfo; do [ -f "$h/$f" ] && $SUDO ls -l "$h/$f"; done; done'

# ---- program hashes ----
if [ "$DO_HASH" = 1 ] && [ -n "$SHA" ]; then
  mkdir -p "$OUT_DIR/hashes"
  # every running program, once (the file the kernel is running, even when it was deleted afterwards)
  { for p in /proc/[0-9]*; do
      f=$($SUDO readlink "$p/exe" 2>/dev/null) || continue
      case "$f" in "") continue;; *"(deleted)") h=$($SUDO $SHA "$p/exe" 2>/dev/null | cut -d' ' -f1); printf '%s  %s  pid=%s\n' "${h:-unreadable}" "$f" "${p#/proc/}";;
        *) h=$($SUDO $SHA "$f" 2>/dev/null | cut -d' ' -f1); printf '%s  %s  pid=%s\n' "${h:-unreadable}" "$f" "${p#/proc/}";; esac
    done | sort -k2,2 -u; } > "$OUT_DIR/hashes/running-programs.sha256" 2>>"$ERR"
  # program files in the usual places and in temp folders
  $SUDO find /usr/bin /usr/sbin /usr/local/bin /usr/local/sbin /bin /sbin /opt /tmp /var/tmp /dev/shm /root /home -xdev -type f \( -perm -u+x -o -perm -g+x -o -perm -o+x \) -size -200M -print0 2>/dev/null | $SUDO xargs -0 $SHA 2>/dev/null > "$OUT_DIR/hashes/executables.sha256"
fi

# ---- files: logs, configuration, user files, persistence ----
tarlist() { out=$1; list=$2; $SUDO tar czf "$out" --ignore-failed-read --warning=no-file-changed -T "$list" 2>/dev/null; rm -f "$list"; }
lst=$(mktemp); $SUDO find /var/log -type f -mtime "-$D" 2>/dev/null > "$lst"; tarlist "$OUT_DIR/files/var-log.tgz" "$lst"
have journalctl && $SUDO journalctl --no-pager -o export --since "$D days ago" 2>/dev/null </dev/null | gzip > "$OUT_DIR/files/journal.export.gz"
$SUDO tar czf "$OUT_DIR/files/etc.tgz" --ignore-failed-read --exclude='/etc/shadow*' --exclude='/etc/gshadow*' --exclude='/etc/ssl/private' --exclude='/etc/*.key' /etc 2>/dev/null
lst=$(mktemp)
getent passwd | awk -F: '$6 != "" && $6 != "/" {print $6}' | sort -u | while read -r h; do
  for f in .bash_history .zsh_history .sh_history .python_history .mysql_history .psql_history .lesshst .viminfo .bashrc .bash_profile .bash_logout .profile .zshrc .ssh/authorized_keys .ssh/config .ssh/known_hosts .gitconfig .wget-hsts .config/autostart .config/systemd/user .local/share/recently-used.xbel; do $SUDO test -e "$h/$f" 2>/dev/null && echo "$h/$f"; done
done > "$lst"; tarlist "$OUT_DIR/files/user-files.tgz" "$lst"
lst=$(mktemp); for f in /var/spool/cron /var/spool/at /etc/cron.d /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/crontab /etc/systemd/system /etc/init.d /etc/rc.local /etc/ld.so.preload /etc/profile.d /etc/udev/rules.d; do [ -e "$f" ] && echo "$f"; done > "$lst"; tarlist "$OUT_DIR/files/persistence.tgz" "$lst"

# ---- timeline bodyfile (mactime format: MD5|name|inode|mode|uid|gid|size|atime|mtime|ctime|crtime) ----
if [ "$DO_BODY" = 1 ]; then
  mkdir -p "$OUT_DIR/bodyfile"
  if find / -maxdepth 0 -printf '' 2>/dev/null; then
    $SUDO find / -xdev \( -path /proc -o -path /sys -o -path /run -o -path /dev \) -prune -o -printf '0|%p|%i|%M|%U|%G|%s|%A@|%T@|%C@|0\n' 2>/dev/null | gzip > "$OUT_DIR/bodyfile/bodyfile.txt.gz"
  else
    $SUDO find / -xdev \( -path /proc -o -path /sys -o -path /run -o -path /dev \) -prune -o -exec stat -c '0|%n|%i|%A|%u|%g|%s|%X|%Y|%Z|0' {} \; 2>/dev/null | gzip > "$OUT_DIR/bodyfile/bodyfile.txt.gz"
  fi
fi

# ---- finish: hand the files to the account Kookaburrow uses, record what was collected and a hash of every file ----
$SUDO chown -R "$(id -u):$(id -g)" "$OUT_DIR" 2>/dev/null
find "$OUT_DIR" -type d -empty -delete 2>/dev/null
{
  echo "Collected by: Kookaburrow - Triage - Linux Full"
  echo "Host: $(hostname) ($(uname -srm))"
  echo "Started (UTC): $(date -u -d @$started +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
  echo "Finished (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Account: $(id -un) (uid $(id -u))${SUDO:+, using sudo}"
  echo "Days of logs and changes: $D; bodyfile: $DO_BODY; hashes: $DO_HASH"
} > "$OUT_DIR/collection-info.txt"
if [ -n "$SHA" ]; then ( cd "$OUT_DIR" && find . -type f ! -name 'file-hashes.sha256' -print0 | xargs -0 $SHA > file-hashes.sha256 2>/dev/null ); fi

# what comes back as text: one line per section with its size
echo "section	files	size_kb"
for s in live_response files hashes bodyfile; do
  [ -d "$OUT_DIR/$s" ] && printf '%s\t%s\t%s\n' "$s" "$(find "$OUT_DIR/$s" -type f | wc -l)" "$(du -sk "$OUT_DIR/$s" | cut -f1)"
done
printf 'total\t%s\t%s\n' "$(find "$OUT_DIR" -type f | wc -l)" "$(du -sk "$OUT_DIR" | cut -f1)"
printf 'minutes\t%s\t\n' "$(( ($(date +%s) - started) / 60 ))"
[ -s "$ERR" ] && printf 'notes\t%s\tsee collection-errors.log\n' "$(wc -l < "$ERR")"
exit 0
