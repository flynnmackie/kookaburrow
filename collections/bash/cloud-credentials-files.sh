NAME='Cloud - Cloud Credential Files'
DESCRIPTION='Presence and age of cloud CLI credential files (AWS, Azure, Google, Kubernetes, Docker registries, Terraform) in home directories. Names and dates only, never the secrets.'
DEPENDENCIES=()
TAGS=(accounts cloud discovery)

printf 'User\tFile\tModified\tSize\n'
getent passwd 2>/dev/null </dev/null | awk -F: '$6!=""{print $1"\t"$6}' | sort -u -k2,2 | while IFS="$(printf '\t')" read -r u h; do for f in .aws/credentials .aws/config .azure/accessTokens.json .azure/msal_token_cache.json .config/gcloud/credentials.db .config/gcloud/application_default_credentials.json .kube/config .docker/config.json .terraform.d/credentials.tfrc.json .config/doctl/config.yaml .oci/config .ssh/config; do [ -f "$h/$f" ] && printf '%s\t%s\t%s\t%s\n' "$u" "$h/$f" "$(date -r "$h/$f" '+%Y-%m-%d %H:%M' 2>/dev/null)" "$(stat -c %s "$h/$f")"; done; done
exit 0
