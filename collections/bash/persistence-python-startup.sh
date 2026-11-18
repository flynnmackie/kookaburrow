NAME='Persistence - Python Startup Hooks'
DESCRIPTION='sitecustomize, usercustomize and .pth files in site-packages, which run code whenever Python starts. Cron jobs and scripts written in Python run them too.'
DEPENDENCIES=()
TAGS=(persistence execution)

printf 'File\tModified\tNote\n'
for d in $(python3 -c 'import site,sys; print(" ".join(site.getsitepackages()+[site.getusersitepackages()]))' 2>/dev/null </dev/null) /usr/lib/python3/dist-packages /usr/local/lib/python3*/dist-packages; do [ -d "$d" ] && for f in "$d"/sitecustomize.py "$d"/usercustomize.py "$d"/*.pth; do [ -f "$f" ] && printf '%s\t%s\t%s\n' "$f" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)" "$(grep -lE '^import ' "$f" >/dev/null 2>&1 && echo 'runs code (import line)' || echo '')"; done; done
exit 0
