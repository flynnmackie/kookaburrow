$Name = 'Software - Store Apps (AppX Packages)'
$Description = 'Microsoft Store and sideloaded app packages for all users, with publisher and install location. Sideloaded packages from unknown publishers are unusual.'
$Dependencies = @()
$Tags = @('inventory', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
Get-AppxPackage -AllUsers | Where-Object { $_.SignatureKind -ne 'System' -or $_.IsDevelopmentMode } | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Version = "$($_.Version)"; Publisher = $_.Publisher; Signature = "$($_.SignatureKind)"; DevMode = $_.IsDevelopmentMode; Location = $_.InstallLocation } }
