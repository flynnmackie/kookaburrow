NAME='Containers - Remove'
DESCRIPTION='Stops and removes a container (docker or podman) by name or ID.'
DEPENDENCIES=()
PARAMETERS=(CONTAINER)
TAGS=(containers remediation)

SUDO=""; if [ "$(id -u)" != "0" ] && sudo -n true 2>/dev/null; then SUDO="sudo -n"; fi
echo "$CONTAINER" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_.-]*$' || { echo "CONTAINER must be a container name or ID" >&2; exit 2; }
for rt in docker podman; do
  command -v $rt >/dev/null 2>&1 || continue
  $SUDO $rt inspect "$CONTAINER" >/dev/null 2>&1 || continue
  q=/var/quarantine-kookaburrow; $SUDO mkdir -p "$q"; $SUDO chmod 700 "$q"
  $SUDO $rt inspect "$CONTAINER" | $SUDO tee "$q/$(date +%Y%m%d-%H%M%S)_container_$CONTAINER.json" >/dev/null
  $SUDO $rt rm -f "$CONTAINER" && echo "Removed $rt container $CONTAINER (configuration saved to $q)"; exit 0
done
echo "No docker or podman container named $CONTAINER" >&2; exit 1
