NAME='Containers - Running Containers and Their Risk'
DESCRIPTION='Running Docker and Podman containers with image, ports, whether they are privileged, use the host network or mount the host filesystem. Privileged containers can take over the host.'
DEPENDENCIES=()
TAGS=(containers privilege-escalation inventory)

printf 'Runtime\tContainer\tImage\tPrivileged\tHostNetwork\tMounts\n'
for rt in docker podman; do command -v $rt >/dev/null 2>&1 || continue; for c in $($rt ps -q 2>/dev/null </dev/null); do $rt inspect --format '{{.Name}}	{{.Config.Image}}	{{.HostConfig.Privileged}}	{{.HostConfig.NetworkMode}}	{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' "$c" 2>/dev/null </dev/null | awk -v r="$rt" 'BEGIN{FS=OFS="\t"} {print r,$1,$2,$3,($4=="host"?"yes":"no"),$5}'; done; done
exit 0
