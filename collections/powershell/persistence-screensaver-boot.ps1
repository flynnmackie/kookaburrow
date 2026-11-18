$Name = 'Persistence - Screensaver and Boot Execute'
$Description = 'The screensaver program and the Session Manager BootExecute and SetupExecute values, which run before the desktop starts.'
$Dependencies = @()
$Tags = @('persistence', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$d = Get-ItemProperty 'HKCU:\Control Panel\Desktop'
[pscustomobject]@{ Setting = 'SCRNSAVE.EXE'; Value = $d.'SCRNSAVE.EXE' }; [pscustomobject]@{ Setting = 'ScreenSaveActive'; Value = $d.ScreenSaveActive }
$s = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager'
foreach ($n in 'BootExecute', 'SetupExecute', 'Execute', 'S0InitialCommand') { foreach ($v in $s.$n) { if ($v) { [pscustomobject]@{ Setting = $n; Value = $v } } } }
