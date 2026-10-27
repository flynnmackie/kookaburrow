NAME='Packages - Repositories'
DESCRIPTION='Software sources and the keys that trust them.'
DEPENDENCIES=()
TAGS=(persistence software inventory)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "== apt sources (modified) =="
ls -l --time-style=long-iso /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null | tail -n +2
grep -rhvE '^\s*(#|$)' /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null
echo "== apt trusted keys =="; ls -l --time-style=long-iso /etc/apt/trusted.gpg.d /usr/share/keyrings /etc/apt/keyrings 2>/dev/null | tail -n +2 | head -n 60
echo "== apt hooks (code run during updates) =="; grep -rE 'Pre-Invoke|Post-Invoke|Update-Post-Invoke|DPkg::Pre' /etc/apt/apt.conf.d 2>/dev/null | cut -c1-200
echo "== yum / dnf repositories =="
grep -hE '^\[|^baseurl|^mirrorlist|^enabled|^gpgcheck' /etc/yum.repos.d/*.repo 2>/dev/null
echo "== zypper repositories =="; ls -l /etc/zypp/repos.d 2>/dev/null | tail -n +2
echo "== pip / npm configuration =="
cat /etc/pip.conf ~/.pip/pip.conf ~/.config/pip/pip.conf ~/.npmrc /etc/npmrc 2>/dev/null | grep -vE '^\s*(#|$)' | sed -E 's/(_authToken|password)=.*/\1=(hidden)/'
echo "== snap and flatpak =="; snap list 2>/dev/null | head -n 40; flatpak remotes 2>/dev/null
exit 0
