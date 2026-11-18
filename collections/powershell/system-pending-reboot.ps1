$Name = 'System - Pending Reboot and Updates'
$Description = 'Shows whether the host is waiting for a reboot (Windows Update, component servicing, file renames) and when updates were last installed.'
$Dependencies = @()
$Tags = @('system', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$k = @{ 'WindowsUpdate' = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'; 'ComponentServicing' = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending' }
foreach ($n in $k.Keys) { [pscustomobject]@{ Check = $n; Pending = [bool](Test-Path $k[$n]) } }
$p = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager').PendingFileRenameOperations
[pscustomobject]@{ Check = 'PendingFileRenameOperations'; Pending = [bool]$p }
$h = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1
[pscustomobject]@{ Check = 'LastHotfix'; Pending = "$($h.HotFixID) $($h.InstalledOn)" }
