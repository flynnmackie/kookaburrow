$Name = 'Services - All Services Detail'
$Description = 'Every service with its start type, account, path and description, running or not. A full baseline of what can start on the host.'
$Dependencies = @()
$Tags = @('services', 'inventory', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Service | ForEach-Object { [pscustomobject]@{ Name = $_.Name; DisplayName = $_.DisplayName; State = $_.State; StartMode = $_.StartMode; Account = $_.StartName; Path = $_.PathName; ServiceType = $_.ServiceType; Description = $_.Description } }
