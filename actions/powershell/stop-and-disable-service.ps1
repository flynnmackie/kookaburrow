$Name = 'Services - Stop and Disable'
$Description = 'Stops a Windows service and sets its start type to Disabled so it does not come back after a reboot.'
$Dependencies = @()
$Parameters = @('ServiceName')
$Tags = @('services', 'persistence', 'containment')

if (-not $ServiceName -or $ServiceName -match '[\*\?]') { throw 'ServiceName is required and must not contain wildcards' }
$s = Get-Service -Name $ServiceName -ErrorAction Stop
Write-Output "Before: $($s.Name) status=$($s.Status) start=$($s.StartType)"
if ($s.Status -ne 'Stopped') { Stop-Service -Name $s.Name -Force -ErrorAction Stop }
Set-Service -Name $s.Name -StartupType Disabled -ErrorAction Stop
$s = Get-Service -Name $ServiceName
Write-Output "After:  $($s.Name) status=$($s.Status) start=$($s.StartType)"
