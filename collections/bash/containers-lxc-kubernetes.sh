NAME='Containers - LXC, Kubernetes and containerd'
DESCRIPTION='LXC containers, Kubernetes node components (kubelet, config, manifests) and containerd. Shows an orchestration layer that a flat host scan would miss.'
DEPENDENCIES=()
TAGS=(containers inventory)

printf 'Kind\tItem\n'
command -v lxc >/dev/null 2>&1 && lxc list --format csv 2>/dev/null </dev/null | while IFS= read -r l; do printf 'lxc\t%s\n' "$l"; done
command -v ctr >/dev/null 2>&1 && ctr containers list 2>/dev/null </dev/null | tail -n +2 | while IFS= read -r l; do printf 'containerd\t%s\n' "$l"; done
for f in /etc/kubernetes/manifests/* /var/lib/kubelet/config.yaml /etc/kubernetes/kubelet.conf /etc/kubernetes/admin.conf; do [ -e "$f" ] && printf 'kubernetes\t%s (%s)\n' "$f" "$(date -r "$f" '+%Y-%m-%d' 2>/dev/null)"; done
pgrep -a 'kubelet|kube-apiserver|etcd|containerd|crio' 2>/dev/null </dev/null | cut -c1-200 | while IFS= read -r l; do printf 'process\t%s\n' "$l"; done
exit 0
