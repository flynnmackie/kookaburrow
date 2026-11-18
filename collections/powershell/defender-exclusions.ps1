$Name = 'Defender - Exclusions and Settings'
$Description = 'Paths, extensions and processes excluded from Microsoft Defender scanning, plus real-time protection and tamper protection state. Exclusions are where malware hides.'
$Dependencies = @()
$Tags = @('antivirus', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$p = Get-MpPreference
foreach ($x in $p.ExclusionPath) { [pscustomobject]@{ Setting = 'ExclusionPath'; Value = $x } }
foreach ($x in $p.ExclusionExtension) { [pscustomobject]@{ Setting = 'ExclusionExtension'; Value = $x } }
foreach ($x in $p.ExclusionProcess) { [pscustomobject]@{ Setting = 'ExclusionProcess'; Value = $x } }
[pscustomobject]@{ Setting = 'DisableRealtimeMonitoring'; Value = $p.DisableRealtimeMonitoring }
[pscustomobject]@{ Setting = 'DisableBehaviorMonitoring'; Value = $p.DisableBehaviorMonitoring }
[pscustomobject]@{ Setting = 'MAPSReporting'; Value = $p.MAPSReporting }
[pscustomobject]@{ Setting = 'TamperProtected'; Value = (Get-MpComputerStatus).IsTamperProtected }
