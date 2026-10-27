$Name = 'Defender - Enable Protection'
$Description = 'Turns Microsoft Defender real-time protection, behaviour monitoring, script scanning and cloud protection back on, for example after an attacker disabled them.'
$Dependencies = @()
$Tags = @('antivirus', 'defense-evasion', 'recovery')

$b = Get-MpPreference
Write-Output "Before: DisableRealtimeMonitoring=$($b.DisableRealtimeMonitoring) DisableBehaviorMonitoring=$($b.DisableBehaviorMonitoring) DisableScriptScanning=$($b.DisableScriptScanning) MAPS=$($b.MAPSReporting)"
Set-MpPreference -DisableRealtimeMonitoring $false -DisableBehaviorMonitoring $false -DisableScriptScanning $false -DisableIOAVProtection $false -MAPSReporting Advanced -ErrorAction Stop
$a = Get-MpPreference
Write-Output "After:  DisableRealtimeMonitoring=$($a.DisableRealtimeMonitoring) DisableBehaviorMonitoring=$($a.DisableBehaviorMonitoring) DisableScriptScanning=$($a.DisableScriptScanning) MAPS=$($a.MAPSReporting)"
if ($a.DisableRealtimeMonitoring) { throw 'Real-time protection is still off (tamper protection or a policy may be preventing the change)' }
