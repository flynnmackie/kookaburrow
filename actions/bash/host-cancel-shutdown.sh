NAME='Host - Cancel Shutdown'
DESCRIPTION='Cancels a pending reboot or power off started with Host - Reboot or Host - Power Off, if the delay has not yet run out.'
DEPENDENCIES=()
TAGS=(recovery host)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
if $SUDO shutdown -c 2>&1; then echo "The pending shutdown was cancelled (or none was pending)."; fi
exit 0
