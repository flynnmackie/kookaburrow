$Name = 'Persistence - Time Providers and Security Packages'
$Description = 'Windows Time service providers, plus Security Support Provider and LSA notification DLLs, which run in privileged services.'
$Dependencies = @()
$Tags = @('persistence', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders' | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ Kind = 'TimeProvider'; Name = $_.PSChildName; Dll = $p.DllName; Enabled = $p.Enabled } }
$l = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\OSConfig').'Security Packages'
foreach ($x in $l) { [pscustomobject]@{ Kind = 'OSConfig security package'; Name = $x; Dll = ''; Enabled = '' } }
