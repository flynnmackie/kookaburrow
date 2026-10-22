$Name = 'Security - Installed Products'
$Description = 'Security software on the host: antivirus products registered with Windows Security Center (name, state, signatures up to date), Defender state, and running services and processes of well-known EDR and monitoring agents (CrowdStrike, SentinelOne, Carbon Black, Cortex, Sophos, Trend Micro, Symantec, McAfee, Elastic, Wazuh, Sysmon, Splunk, Velociraptor, osquery and others). Tells you what is watching the host, and what an attacker has stopped.'
$Dependencies = @()
$Tags = @('inventory', 'antivirus', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct) {
    $hex = '{0:X6}' -f [int]$p.productState
    [pscustomobject]@{ Source = 'Security Center'; Name = $p.displayName; State = $(if ($hex.Substring(2, 2) -in '10', '11') { 'on' } else { 'off' }); Detail = "signatures $(if ($hex.Substring(4, 2) -eq '00') { 'up to date' } else { 'out of date' }) (state 0x$hex)" }
}
$s = Get-MpComputerStatus
if ($s) { [pscustomobject]@{ Source = 'Defender'; Name = 'Microsoft Defender'; State = "realtime=$($s.RealTimeProtectionEnabled) tamper=$($s.IsTamperProtected)"; Detail = "engine $($s.AMEngineVersion) signatures $($s.AntivirusSignatureVersion) updated $($s.AntivirusSignatureLastUpdated)" } }
$pat = 'crowdstrike|csfalcon|csagent|sentinel|carbonblack|cbdefense|cb\.exe|cortex|cyserver|traps|sophos|trend|ds_agent|symantec|mcafee|masvc|elastic|wazuh|ossec|sysmon|splunk|velociraptor|osquery|tanium|qualys|nessus|rapid7|ir_agent|defender|mssense|senseir|cylance|fireeye|xagt|bitdefender|eset|kaspersky|avast|avg|malwarebytes|webroot|cybereason|crowdstrike|falcon|palo|microsoft monitoring|healthservice|ossec'
Get-CimInstance Win32_Service | Where-Object { "$($_.Name) $($_.DisplayName) $($_.PathName)" -match $pat } | ForEach-Object { [pscustomobject]@{ Source = 'Service'; Name = $_.Name; State = $_.State; Detail = "$($_.DisplayName) | $($_.PathName)" } }
Get-CimInstance Win32_Process | Where-Object { "$($_.Name) $($_.ExecutablePath)" -match $pat } | ForEach-Object { [pscustomobject]@{ Source = 'Process'; Name = $_.Name; State = 'running'; Detail = "PID $($_.ProcessId) $($_.ExecutablePath)" } }
