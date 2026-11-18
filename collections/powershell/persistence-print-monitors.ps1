$Name = 'Persistence - Print Monitors and Providers'
$Description = 'Print monitors and providers registered with the spooler. Their DLLs load as SYSTEM at boot.'
$Dependencies = @()
$Tags = @('persistence', 'privilege-escalation', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in 'Monitors', 'Print Processors', 'Providers') { Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Control\Print\$root" | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ Kind = $root; Name = $_.PSChildName; Dll = "$($p.Driver)$($p.Name)" } } }
