NAME='Files - Capabilities'
DESCRIPTION='Programs with Linux file capabilities set (getcap), for example cap_setuid or cap_dac_override on an interpreter or copy of a shell. Capabilities are a quiet alternative to SUID that attackers use for privilege escalation and persistence. Needs getcap (libcap2-bin or libcap), and root for a complete scan.'
DEPENDENCIES=()
TAGS=(privilege-escalation persistence filesystem)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
command -v getcap >/dev/null 2>&1 || { echo "getcap is not installed on this host" >&2; exit 1; }
$SUDO getcap -r / 2>/dev/null
exit 0
