NAME='System - Cloud Instance Details'
DESCRIPTION='Cloud provider, instance id and the cloud-init data recorded on the host, read locally (no metadata request is made).'
DEPENDENCIES=()
TAGS=(inventory system)

printf 'Item\tValue\n'
for f in /var/lib/cloud/data/instance-id /var/lib/cloud/data/result.json /run/cloud-init/instance-data.json; do [ -r "$f" ] && printf 'cloud-init file\t%s (%s)\n' "$f" "$(date -r "$f" '+%Y-%m-%d %H:%M' 2>/dev/null)"; done
printf 'instance-id\t%s\n' "$(cat /var/lib/cloud/data/instance-id 2>/dev/null)"
printf 'Cloud vendor (DMI)\t%s\n' "$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null) $(cat /sys/class/dmi/id/chassis_asset_tag 2>/dev/null)"
for d in /usr/bin/amazon-ssm-agent /usr/bin/google_guest_agent /usr/sbin/waagent /usr/bin/oci-metadata /opt/aws /opt/google; do [ -e "$d" ] && printf 'Cloud agent\t%s\n' "$d"; done
exit 0
