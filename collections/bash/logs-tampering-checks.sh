NAME='Logs - Tampering Checks'
DESCRIPTION='Signs that logs and history were cleared or disabled: log files that are empty or smaller than expected for their age, wtmp, btmp and lastlog with suspicious sizes or gaps, history files linked to /dev/null or set to a zero size, HISTFILE or HISTSIZE overridden in startup files, immutable or append-only flags on logs (set to stop rotation or editing), journald storage disabled, and auditd rules that were removed. Needs root, or an account with passwordless sudo, to see every file.'
DEPENDENCIES=()
TAGS=(defense-evasion event-logs forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== Empty or tiny log files that are old enough to have content =="
$SUDO find /var/log -maxdepth 2 -type f -size -2 -mtime +1 \( -name '*.log' -o -name 'syslog' -o -name 'messages' -o -name 'auth.log' -o -name 'secure' -o -name 'wtmp' -o -name 'btmp' -o -name 'lastlog' \) -printf '%TY-%Tm-%Td %TH:%TM\t%s bytes\t%p\n' 2>/dev/null
echo "== Key logs: size, modified, flags =="
for f in /var/log/auth.log /var/log/secure /var/log/syslog /var/log/messages /var/log/wtmp /var/log/btmp /var/log/lastlog /var/log/audit/audit.log; do
  $SUDO test -e "$f" && printf '%s\t%s bytes\t%s\t%s\n' "$f" "$($SUDO stat -c %s "$f")" "$($SUDO stat -c %y "$f" | cut -d. -f1)" "$($SUDO lsattr -d "$f" 2>/dev/null | cut -c1-20)"
done
echo "== Logs with immutable or append-only flags =="
$SUDO lsattr -R /var/log 2>/dev/null | grep -E '^[-a-zA-Z]*[ia][-a-zA-Z]* ' | head -n 30
echo "== History files that are links to /dev/null or empty =="
getent passwd | awk -F: '$6 != "" {print $1":"$6}' | while IFS=: read -r u h; do
  for f in .bash_history .zsh_history .sh_history; do
    p="$h/$f"
    if $SUDO test -L "$p"; then echo "$u $f -> $($SUDO readlink "$p")"; elif $SUDO test -f "$p" && [ "$($SUDO stat -c %s "$p")" = 0 ]; then echo "$u $f is empty (modified $($SUDO stat -c %y "$p" | cut -d. -f1))"; fi
  done
done
echo "== History disabled in startup files =="
grep -rnE 'unset HISTFILE|HISTFILE=/dev/null|HISTSIZE=0|HISTFILESIZE=0|set \+o history|export HISTCONTROL=ignorespace' /etc/profile /etc/profile.d /etc/bash.bashrc /etc/bashrc /root/.bashrc /root/.bash_profile /home/*/.bashrc /home/*/.bash_profile /home/*/.profile 2>/dev/null | cut -c1-200
echo "== journald storage =="; grep -rE '^Storage=|^SystemMaxUse=|^ForwardTo' /etc/systemd/journald.conf /etc/systemd/journald.conf.d 2>/dev/null; ls -d /var/log/journal 2>/dev/null || echo "no persistent journal directory"
echo "== auditd rules =="; command -v auditctl >/dev/null 2>&1 && $SUDO auditctl -l 2>/dev/null | head -n 20
exit 0
