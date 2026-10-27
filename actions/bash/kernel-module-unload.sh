NAME='Kernel - Unload Module'
DESCRIPTION='Unloads a kernel module (rmmod) and optionally stops it loading again by adding it to a modprobe blacklist (BLACKLIST set to yes, in /etc/modprobe.d/kookaburrow-blacklist.conf).'
DEPENDENCIES=()
PARAMETERS=(MODULE_NAME BLACKLIST?)
TAGS=(kernel containment remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$MODULE_NAME" | grep -Eq '^[A-Za-z0-9_-]+$' || { echo "MODULE_NAME must be a module name" >&2; exit 2; }
if lsmod | awk '{print $1}' | grep -qx "$(echo "$MODULE_NAME" | tr - _)"; then
  $SUDO rmmod "$MODULE_NAME" 2>&1 && echo "Unloaded $MODULE_NAME" || { echo "Could not unload $MODULE_NAME (in use?)" >&2; exit 1; }
else echo "$MODULE_NAME is not loaded"; fi
case "$BLACKLIST" in y|yes|true|1)
  $SUDO mkdir -p /etc/modprobe.d
  printf 'blacklist %s\ninstall %s /bin/false\n' "$MODULE_NAME" "$MODULE_NAME" | $SUDO tee -a /etc/modprobe.d/kookaburrow-blacklist.conf >/dev/null
  echo "Blacklisted $MODULE_NAME in /etc/modprobe.d/kookaburrow-blacklist.conf";; esac
exit 0
