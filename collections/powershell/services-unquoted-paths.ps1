$Name = 'Services - Unquoted Service Paths'
$Description = 'Services whose executable path contains spaces and is not quoted. If a writable folder is on that path, a planted program runs as the service account.'
$Dependencies = @()
$Tags = @('services', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Service | Where-Object { $_.PathName -and $_.PathName -notmatch '^"' -and $_.PathName -match '^[A-Za-z]:\\.* .*\.exe' -and $_.PathName -notmatch '^[A-Za-z]:\\Windows\\' } | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Account = $_.StartName; StartMode = $_.StartMode; Path = $_.PathName } }
