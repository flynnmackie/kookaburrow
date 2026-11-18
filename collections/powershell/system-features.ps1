$Name = 'System - Windows Features'
$Description = 'Lists optional Windows features that are enabled (SMB1, Telnet, TFTP, Hyper-V, WSL and others), each of which widens the attack surface.'
$Dependencies = @()
$Tags = @('inventory', 'system', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$f = Get-WindowsOptionalFeature -Online | Where-Object { $_.State -eq 'Enabled' }
if ($f) { $f | ForEach-Object { [pscustomobject]@{ Feature = $_.FeatureName; State = "$($_.State)" } } }
else { Get-CimInstance Win32_OptionalFeature | ForEach-Object { [pscustomobject]@{ Feature = $_.Name; State = 'Installed' } } }
