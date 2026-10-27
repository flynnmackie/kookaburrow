NAME='Files - Capabilities'
DESCRIPTION='Programs with Linux file capabilities set (getcap), for example cap_setuid or cap_dac_override on an interpreter or copy of a shell. Needs root or passwordless sudo.'
DEPENDENCIES=()
TAGS=(privilege-escalation persistence filesystem)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v getcap >/dev/null 2>&1 || { echo "getcap is not installed on this host" >&2; exit 1; }
$SUDO getcap -r / 2>/dev/null
exit 0
