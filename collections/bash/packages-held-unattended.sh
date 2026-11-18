NAME='Packages - Held Packages and Automatic Updates'
DESCRIPTION='Packages on hold, and whether unattended or automatic updates are configured. Held security packages and disabled updates leave known vulnerabilities in place.'
DEPENDENCIES=()
TAGS=(packages security inventory)

printf 'Item\tValue\n'
command -v apt-mark >/dev/null 2>&1 && apt-mark showhold 2>/dev/null </dev/null | while IFS= read -r l; do printf 'held (apt)\t%s\n' "$l"; done
command -v dnf >/dev/null 2>&1 && dnf versionlock list 2>/dev/null </dev/null | grep -v '^Last' | while IFS= read -r l; do printf 'versionlock (dnf)\t%s\n' "$l"; done
grep -hE 'Unattended-Upgrade::|APT::Periodic::Update-Package-Lists|APT::Periodic::Unattended-Upgrade' /etc/apt/apt.conf.d/20auto-upgrades /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null | grep -vE '^\s*//' | sed 's/\s\+/ /g' | head -n 20 | while IFS= read -r l; do printf 'apt setting\t%s\n' "$l"; done
[ -r /etc/dnf/automatic.conf ] && grep -E '^(apply_updates|upgrade_type)' /etc/dnf/automatic.conf | while IFS= read -r l; do printf 'dnf automatic\t%s\n' "$l"; done
exit 0
