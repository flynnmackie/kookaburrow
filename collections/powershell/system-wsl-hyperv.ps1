$Name = 'System - WSL and Hyper-V'
$Description = 'Windows Subsystem for Linux distributions and Hyper-V virtual machines. A hidden Linux environment or VM can run tools that Windows security cannot see.'
$Dependencies = @()
$Tags = @('inventory', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
if (Test-Path $k) { Get-ChildItem $k | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ Kind = 'WSL'; Name = $p.DistributionName; Path = $p.BasePath; State = $p.State } } }
Get-VM | ForEach-Object { [pscustomobject]@{ Kind = 'Hyper-V'; Name = $_.Name; Path = $_.Path; State = "$($_.State)" } }
