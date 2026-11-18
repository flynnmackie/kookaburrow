$Name = 'Persistence - Netsh Helper DLLs'
$Description = 'DLLs registered as netsh helpers. They load whenever netsh runs, including from scripts.'
$Dependencies = @()
$Tags = @('persistence', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$k = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NetSh'
foreach ($n in ($k.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { [pscustomobject]@{ Helper = $n.Name; Dll = $n.Value; Exists = (Test-Path (Join-Path $env:SystemRoot "System32\$($n.Value)")) } }
