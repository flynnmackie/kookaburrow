NAME='Shell - Other History'
DESCRIPTION='Command and query history kept by other tools in every home directory. Needs root or passwordless sudo.'
DEPENDENCIES=()
PARAMETERS=(CONTAINS?)
TAGS=(history execution forensics)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
getent passwd | awk -F: '$6 != "" && $7 !~ /(nologin|false)$/ {print $1":"$6}' | while IFS=: read -r u h; do
  for f in .python_history .mysql_history .psql_history .rediscli_history .sqlite_history .node_repl_history .lesshst .wget-hsts .viminfo .gitconfig .git-credentials; do
    p="$h/$f"
    $SUDO test -r "$p" 2>/dev/null || continue
    echo "== $u: $p (modified $($SUDO stat -c %y "$p" 2>/dev/null | cut -d. -f1)) =="
    case "$f" in .git-credentials) echo "(present: contains stored credentials, content not shown)";; *) $SUDO tail -n 200 "$p" 2>/dev/null | { if [ -n "$CONTAINS" ]; then grep -iF -- "$CONTAINS"; else cat; fi; } | cut -c1-300;; esac
  done
done
exit 0
