NAME='Containers - Docker Daemon Configuration'
DESCRIPTION='Docker daemon settings (exposed TCP socket, insecure registries, user namespace, live restore) and who can use the Docker socket. Access to the Docker socket is root access.'
DEPENDENCIES=()
TAGS=(containers privilege-escalation security)

printf 'Item\tValue\n'
[ -r /etc/docker/daemon.json ] && tr -d '\n' < /etc/docker/daemon.json 2>/dev/null | sed 's/\s\+/ /g' | while IFS= read -r l; do printf 'daemon.json\t%s\n' "$l"; done
[ -S /var/run/docker.sock ] && printf 'docker.sock\t%s\n' "$(stat -c '%U:%G %a' /var/run/docker.sock)"
printf 'docker group members\t%s\n' "$(getent group docker 2>/dev/null </dev/null | cut -d: -f4)"
for f in /lib/systemd/system/docker.service /etc/systemd/system/docker.service /etc/systemd/system/docker.service.d/*; do [ -r "$f" ] && grep -E 'ExecStart=|tcp://' "$f" 2>/dev/null | while IFS= read -r l; do printf '%s\t%s\n' "$f" "$l"; done; done
exit 0
