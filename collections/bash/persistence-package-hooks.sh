NAME='Persistence - Package Manager Hooks'
DESCRIPTION='apt, dpkg and yum hooks that run commands when packages change (Pre-Invoke, Post-Invoke, DPkg::Post-Invoke, yum plugins). A well known place to hide a command that runs at every update.'
DEPENDENCIES=()
TAGS=(persistence packages)

printf 'File\tHook\n'
for f in /etc/apt/apt.conf /etc/apt/apt.conf.d/*; do [ -f "$f" ] && grep -E 'Pre-Invoke|Post-Invoke|Pre-Install-Pkgs|Update-Post-Invoke|Post-Invoke-Success' "$f" 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
for f in /etc/yum/pluginconf.d/*.conf /etc/dnf/plugins/*.conf; do [ -f "$f" ] && grep -E '^enabled' "$f" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
for f in /etc/dpkg/dpkg.cfg.d/* /etc/dpkg/dpkg.cfg; do [ -f "$f" ] && grep -E 'pre-invoke|post-invoke' "$f" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
exit 0
