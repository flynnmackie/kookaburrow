NAME='Network - Proxy Configuration'
DESCRIPTION='System and package manager proxy settings from environment files, apt and yum configuration. A proxy set by an attacker routes traffic through their server.'
DEPENDENCIES=()
TAGS=(network c2 defense-evasion)

printf 'Source\tSetting\n'
for f in /etc/environment /etc/profile /etc/profile.d/*.sh /etc/apt/apt.conf /etc/apt/apt.conf.d/* /etc/yum.conf /etc/dnf/dnf.conf /etc/wgetrc /etc/curlrc; do [ -r "$f" ] && grep -iE '(https?|ftp|no)_proxy|Acquire::https?::Proxy|^proxy' "$f" 2>/dev/null | sed 's/\s\+/ /g;s#//[^:/@]*:[^@/]*@#//user:hidden@#' | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
env 2>/dev/null | grep -iE '^(https?|ftp|no|all)_proxy=' | sed 's#//[^:/@]*:[^@/]*@#//user:hidden@#' | while IFS= read -r l; do printf 'environment of this session\t%s\n' "$l"; done
exit 0
