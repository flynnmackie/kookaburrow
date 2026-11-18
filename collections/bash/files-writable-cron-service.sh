NAME='Files - Writable Scheduled and Service Files'
DESCRIPTION='Cron files, systemd units and init scripts that other users can write. Anyone who can change them runs code as root.'
DEPENDENCIES=()
TAGS=(filesystem privilege-escalation persistence)

printf 'Path\tMode\tOwner\n'
find /etc/cron.d /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly /etc/crontab /var/spool/cron /etc/systemd/system /usr/lib/systemd/system /lib/systemd/system /etc/init.d /etc/rc.local /etc/sudoers.d -xdev -type f \( -perm -0002 -o -perm -0020 \) -printf '%p\t%m\t%u\n' 2>/dev/null | head -n 100
exit 0
