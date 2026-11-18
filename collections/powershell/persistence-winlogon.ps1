$Name = 'Persistence - Winlogon Helpers'
$Description = 'Winlogon Shell, Userinit and notification settings. Extra values here run a program at every logon.'
$Dependencies = @()
$Tags = @('persistence', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Winlogon') { $p = Get-ItemProperty $k; foreach ($n in 'Shell', 'Userinit', 'VMApplet', 'AppSetup', 'TaskMan', 'System', 'GinaDLL') { if ($p.$n) { [pscustomobject]@{ Key = $k; Value = $n; Data = $p.$n } } } }
foreach ($s in (Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\Notify')) { [pscustomobject]@{ Key = $s.Name; Value = 'Notify DLL'; Data = (Get-ItemProperty $s.PSPath).DllName } }
