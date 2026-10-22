$Name = 'Services - Start'
$Description = 'Starts a service by its short name, for example to bring back a security agent or logging service that was stopped. Optionally StartupType (Automatic, Manual or Disabled) sets how it starts at boot first.'
$Dependencies = @()
$Parameters = @('ServiceName', 'StartupType?')
$Tags = @('recovery', 'services')

if (-not $ServiceName) { throw 'ServiceName is required' }
$s = Get-Service -Name $ServiceName -ErrorAction Stop
if ($StartupType) { Set-Service -Name $ServiceName -StartupType $StartupType -ErrorAction Stop; Write-Output "Startup type set to $StartupType" }
if ($s.Status -ne 'Running') { Start-Service -Name $ServiceName -ErrorAction Stop }
Write-Output "$ServiceName is $((Get-Service -Name $ServiceName).Status)"
