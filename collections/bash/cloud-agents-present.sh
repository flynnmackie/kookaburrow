NAME='Cloud - Cloud and Monitoring Agents'
DESCRIPTION='Cloud provider agents and endpoint or monitoring agents present on the host (SSM, Azure and Google agents, Datadog, Splunk, CrowdStrike, Wazuh and others) from services and files.'
DEPENDENCIES=()
TAGS=(inventory security)

printf 'Agent\tState\tEvidence\n'
for a in amazon-ssm-agent google-guest-agent waagent walinuxagent cloud-init datadog-agent splunkd splunkforwarder falcon-sensor ds_agent ossec wazuh-agent filebeat metricbeat auditbeat zabbix-agent nrpe telegraf node_exporter qualys-cloud-agent nessusd osqueryd sentinelone clamav-daemon sophos-spl cbagentd; do st=""; command -v systemctl >/dev/null 2>&1 && st=$(systemctl is-active "$a" 2>/dev/null </dev/null); [ -n "$st" ] && [ "$st" != inactive ] && [ "$st" != unknown ] && printf '%s\t%s\tservice\n' "$a" "$st"; done
for d in /opt/CrowdStrike /opt/splunk /opt/splunkforwarder /opt/datadog-agent /var/ossec /opt/sentinelone /opt/microsoft/mdatp /opt/nessus_agent /opt/qualys /opt/McAfee /opt/Tanium /opt/sophos-spl; do [ -d "$d" ] && printf '%s\tpresent\tdirectory\n' "$d"; done
exit 0
