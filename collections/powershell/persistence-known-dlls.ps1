$Name = 'Persistence - KnownDLLs and Shell Folders'
$Description = 'The KnownDLLs list (libraries Windows loads from System32 first) and the user shell folder redirections that can point Startup to another location.'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$k = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs'
foreach ($n in ($k.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { [pscustomobject]@{ Kind = 'KnownDLL'; Name = $n.Name; Value = $n.Value } }
foreach ($path in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') { $u = Get-ItemProperty $path; foreach ($n in 'Startup', 'Common Startup') { if ($u.$n) { [pscustomobject]@{ Kind = 'Shell folder'; Name = "$path $n"; Value = $u.$n } } } }
