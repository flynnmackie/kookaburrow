NAME='Containers - Docker and Podman'
DESCRIPTION='Containers on the host: running and stopped containers with image, command, ports and creation time, images, volumes and networks, and a security check of each container (privileged mode, host network or PID namespace, mounted Docker socket, added capabilities, bind mounts of sensitive host paths). A container with the Docker socket or a privileged flag is root on the host. Works for Docker and Podman. Needs root, an account in the docker group, or passwordless sudo.'
DEPENDENCIES=()
TAGS=(inventory privilege-escalation persistence containers)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
found=0
for rt in docker podman; do
  command -v "$rt" >/dev/null 2>&1 || continue
  found=1
  echo "== $rt containers (id image command created status ports names) =="
  $SUDO $rt ps -a --no-trunc --format '{{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}' 2>&1 | cut -c1-400
  echo "== $rt images =="; $SUDO $rt images --digests --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}' 2>&1
  echo "== $rt volumes =="; $SUDO $rt volume ls 2>&1
  echo "== $rt networks =="; $SUDO $rt network ls 2>&1
  echo "== $rt container security check =="
  for c in $($SUDO $rt ps -aq 2>/dev/null); do
    $SUDO $rt inspect --format '{{.Name}}\tprivileged={{.HostConfig.Privileged}}\tnetwork={{.HostConfig.NetworkMode}}\tpid={{.HostConfig.PidMode}}\tcapadd={{.HostConfig.CapAdd}}\tbinds={{.HostConfig.Binds}}' "$c" 2>/dev/null
  done
done
[ "$found" = 1 ] || echo "neither docker nor podman is installed on this host"
exit 0
