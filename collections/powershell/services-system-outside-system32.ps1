$Name = 'Services - SYSTEM Services Outside System Folders'
$Description = 'Services running as SYSTEM or an administrator whose program is outside Windows and Program Files. Third-party and malicious services that run with full rights.'
$Dependencies = @()
$Tags = @('services', 'persistence', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Service | Where-Object { $_.StartName -match 'LocalSystem|SYSTEM|Administrator' -and $_.PathName -and $_.PathName -notmatch '(?i)^"?[A-Z]:\\(Windows|Program Files|Program Files \(x86\))\\' } | ForEach-Object { [pscustomobject]@{ Name = $_.Name; State = $_.State; StartMode = $_.StartMode; Account = $_.StartName; Path = $_.PathName } }
