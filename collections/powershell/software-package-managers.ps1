$Name = 'Software - Chocolatey, Winget and Scoop Packages'
$Description = 'Packages installed by command-line package managers. Software installed this way does not appear in Programs and Features.'
$Dependencies = @()
$Tags = @('inventory', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
if (Get-Command choco) { choco list --local-only --limit-output 2>&1 | ForEach-Object { $a = $_ -split '\|'; if ($a.Count -eq 2) { [pscustomobject]@{ Manager = 'Chocolatey'; Name = $a[0]; Version = $a[1] } } } }
if (Test-Path "$env:USERPROFILE\scoop\apps") { Get-ChildItem "$env:USERPROFILE\scoop\apps" -Directory | ForEach-Object { [pscustomobject]@{ Manager = 'Scoop'; Name = $_.Name; Version = '' } } }
foreach ($p in (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Directory)) { [pscustomobject]@{ Manager = 'Winget (portable)'; Name = $p.Name; Version = '' } }
