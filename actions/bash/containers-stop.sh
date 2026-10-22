NAME='Containers - Stop'
DESCRIPTION='Stops a running container (docker or podman) by name or ID, giving it 10 seconds before it is killed. The container and its data are kept for investigation. Use Containers - Docker and Podman to list them.'
DEPENDENCIES=()
PARAMETERS=(CONTAINER)
TAGS=(containers containment)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$CONTAINER" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]*$' || { echo "CONTAINER must be a container name or ID" >&2; exit 2; }
for rt in docker podman; do
  command -v $rt >/dev/null 2>&1 || continue
  $SUDO $rt inspect "$CONTAINER" >/dev/null 2>&1 || continue
  echo "Stopping $rt container: $($SUDO $rt inspect --format '{{.Name}} image={{.Config.Image}}' "$CONTAINER")"
  $SUDO $rt stop "$CONTAINER" && echo "Stopped $CONTAINER"; exit 0
done
echo "No docker or podman container named $CONTAINER" >&2; exit 1
