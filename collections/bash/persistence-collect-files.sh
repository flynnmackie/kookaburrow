NAME='Persistence - Collect Files'
DESCRIPTION='Collects the files that control startup and privilege on a Linux host as one compressed archive: cron folders and user crontabs, systemd unit folders (system and user), rc.local and init.d, profile.d and shell rc files, ld.so.preload and linker config, sudoers, PAM, SSH daemon config and every authorized_keys file. The raw copies let you diff them against a known-good host. The archive comes back over SFTP. Needs root, or an account with passwordless sudo.'
DEPENDENCIES=()
TAGS=(persistence forensics systemd cron)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
list=$(mktemp)
for p in /etc/crontab /etc/cron.d /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/anacrontab /var/spool/cron /var/spool/at /etc/systemd/system /etc/systemd/user /run/systemd/system /usr/local/lib/systemd /etc/rc.local /etc/init.d /etc/rc.d /etc/profile /etc/profile.d /etc/bash.bashrc /etc/bashrc /etc/environment /etc/ld.so.preload /etc/ld.so.conf /etc/ld.so.conf.d /etc/sudoers /etc/sudoers.d /etc/pam.d /etc/ssh/sshd_config /etc/ssh/sshd_config.d /etc/modules /etc/modules-load.d /etc/udev/rules.d /etc/update-motd.d /etc/xdg/autostart; do
  $SUDO test -e "$p" 2>/dev/null && echo "$p"
done > "$list"
getent passwd | awk -F: '$6 != "" {print $6}' | sort -u | while read -r h; do
  for f in .ssh/authorized_keys .ssh/authorized_keys2 .config/systemd/user .config/autostart .bashrc .bash_profile .profile .zshrc; do $SUDO test -e "$h/$f" 2>/dev/null && echo "$h/$f"; done
done >> "$list"
$SUDO tar czf "$OUT_DIR/persistence-files.tgz" -T "$list" 2>/dev/null
$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/persistence-files.tgz" 2>/dev/null
[ -s "$OUT_DIR/persistence-files.tgz" ] || { echo "could not create the archive" >&2; exit 1; }
echo "paths collected: $(wc -l < "$list")"
rm -f "$list"
exit 0
