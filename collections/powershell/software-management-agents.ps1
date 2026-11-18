$Name = 'Software - Management and Monitoring Agents'
$Description = 'Endpoint management and monitoring agents present (SCCM, Intune, Tanium, Qualys, Nessus, Splunk, Datadog, Zabbix and others), from services and installed programs.'
$Dependencies = @()
$Tags = @('inventory', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$pat = 'CcmExec|SMS Agent|Intune|IntuneManagementExtension|Tanium|Qualys|Nessus|Splunk|Datadog|Zabbix|SolarWinds|PDQ|Kaseya|N-able|NinjaRMM|Atera|ConnectWise|LabTech|Automox|Chef|Puppet|Salt|Ansible|Elastic|Beats|Wazuh|OSSEC|Nagios|PRTG'
Get-CimInstance Win32_Service | Where-Object { $_.Name -match $pat -or $_.DisplayName -match $pat -or $_.PathName -match $pat } | ForEach-Object { [pscustomobject]@{ Kind = 'Service'; Name = $_.Name; State = $_.State; Detail = $_.PathName } }
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') { Get-ChildItem $k | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName -match $pat) { [pscustomobject]@{ Kind = 'Program'; Name = $p.DisplayName; State = ''; Detail = $p.DisplayVersion } } } }
