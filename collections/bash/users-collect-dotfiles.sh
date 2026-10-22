NAME='Users - Collect Dotfiles'
DESCRIPTION='Collects per-user evidence from every home directory as a compressed archive: shell histories (bash, zsh, fish), shell startup files, SSH authorized_keys, config and known_hosts (private keys are never collected), vim, less, Python, MySQL and PostgreSQL histories, git configuration, user crontabs and systemd user units. The archive comes back over SFTP. Needs root, or an account with passwordless sudo, to read other homes.'
DEPENDENCIES=()
TAGS=(forensics history persistence accounts)
FOOTPRINT='transient'
RETURNS='both'
TYPE='artefact'
TRANSFER='large'

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
list=$(mktemp)
getent passwd | awk -F: '$6 != "" && $6 != "/" {print $6}' | sort -u | while read -r h; do
  for f in .bash_history .zsh_history .local/share/fish/fish_history .bashrc .bash_profile .bash_logout .profile .zshrc .zprofile .viminfo .lesshst .python_history .mysql_history .psql_history .rediscli_history .gitconfig .ssh/authorized_keys .ssh/authorized_keys2 .ssh/config .ssh/known_hosts .config/autostart .config/systemd/user; do
    $SUDO test -e "$h/$f" 2>/dev/null && echo "$h/$f"
  done
done > "$list"
for d in /var/spool/cron /var/spool/cron/crontabs; do $SUDO test -d "$d" && echo "$d" >> "$list"; done
[ -s "$list" ] || { echo "nothing to collect" >&2; exit 1; }
$SUDO tar czf "$OUT_DIR/user-files.tgz" -T "$list" 2>/dev/null
$SUDO chown "$(id -u):$(id -g)" "$OUT_DIR/user-files.tgz" 2>/dev/null
echo "paths collected: $(wc -l < "$list")"
cat "$list"
rm -f "$list"
exit 0
