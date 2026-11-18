$Name = 'System - Windows Update Configuration'
$Description = 'Windows Update settings and policy: automatic update mode, a WSUS server and whether it uses HTTP. A rogue WSUS server pushes attacker updates; disabled updates leave holes.'
$Dependencies = @()
$Tags = @('system', 'security', 'lateral-movement', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$au = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
$wu = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
foreach ($n in 'NoAutoUpdate', 'AUOptions', 'UseWUServer', 'ScheduledInstallDay', 'NoAutoRebootWithLoggedOnUsers') { [pscustomobject]@{ Setting = "AU $n"; Value = $au.$n } }
foreach ($n in 'WUServer', 'WUStatusServer', 'TargetGroup', 'DoNotConnectToWindowsUpdateInternetLocations', 'DisableWindowsUpdateAccess') { [pscustomobject]@{ Setting = $n; Value = $wu.$n } }
if ($wu.WUServer -match '^http://') { [pscustomobject]@{ Setting = 'WARNING'; Value = 'WSUS server uses HTTP, which can be intercepted' } }
$s = Get-Service wuauserv
[pscustomobject]@{ Setting = 'Windows Update service'; Value = "$($s.Status) / $($s.StartType)" }
