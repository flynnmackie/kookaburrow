$Name = 'Registry - AutoPlay and Removable Media Policy'
$Description = 'AutoRun and AutoPlay settings and the policy that blocks removable storage. Open AutoRun lets a USB stick start a program.'
$Dependencies = @()
$Tags = @('security', 'registry', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($e in @(@('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer', 'NoDriveTypeAutoRun'), @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer', 'NoAutorun'), @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\AutoplayHandlers', 'DisableAutoplay'), @('HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR', 'Start'), @('HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices', 'Deny_All'))) { [pscustomobject]@{ Key = $e[0]; Value = $e[1]; Data = (Get-ItemProperty $e[0]).($e[1]) } }
