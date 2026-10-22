$Name = 'Persistence - System Hooks'
$Description = 'Lesser-known registry persistence points in one list: Winlogon Shell and Userinit, AppInit_DLLs, AppCertDLLs, LSA authentication, security and notification packages, Netsh helper DLLs, Time Provider DLLs, Print Monitors, screensaver, boot execute, Terminal Server initial program and Explorer shell extensions (Windows.Persistence.* and Sysinternals Autoruns locations).'
$Dependencies = @()
$Tags = @('persistence', 'registry', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
$items = @(
    @('Winlogon', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon', 'Shell,Userinit,Taskman,AppSetup,VmApplet,GinaDLL'),
    @('AppInit_DLLs', 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows', 'AppInit_DLLs,LoadAppInit_DLLs'),
    @('AppInit_DLLs (32-bit)', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Windows', 'AppInit_DLLs,LoadAppInit_DLLs'),
    @('AppCertDLLs', 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\AppCertDlls', '*'),
    @('LSA', 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa', 'Authentication Packages,Security Packages,Notification Packages,RunAsPPL,LsaCfgFlags'),
    @('Session Manager', 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager', 'BootExecute,SetupExecute,PendingFileRenameOperations,Execute'),
    @('Netsh helpers', 'HKLM:\SOFTWARE\Microsoft\NetSh', '*'),
    @('Time providers', 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\TimeProviders', 'DllName'),
    @('Terminal Server', 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\Wds\rdpwd', 'StartupPrograms'),
    @('Boot verification', 'HKLM:\SYSTEM\CurrentControlSet\Control\BootVerificationProgram', 'ImagePath'),
    @('Shell folders hijack', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellExecuteHooks', '*'),
    @('Shell icon overlay', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\ShellIconOverlayIdentifiers', '(default)')
)
foreach ($i in $items) {
    $paths = @(Get-Item $i[1]) + @(Get-ChildItem $i[1] | Where-Object { $i[0] -in 'Time providers', 'Shell icon overlay' })
    foreach ($k in $paths) {
        if (-not $k) { continue }
        $names = if ($i[2] -eq '*') { $k.GetValueNames() } else { $i[2] -split ',' }
        foreach ($n in $names) { $v = $k.GetValue($(if ($n -eq '(default)') { '' } else { $n })); if ($null -ne $v -and "$v" -ne '') { [pscustomobject]@{ Hook = $i[0]; Key = $k.Name -replace '^HKEY_LOCAL_MACHINE', 'HKLM'; Name = $n; Value = ($v -join ' ') } } }
    }
}
# Print monitors and providers load a DLL into the spooler (SYSTEM)
foreach ($k in Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors') { $d = $k.GetValue('Driver'); if ($d) { [pscustomobject]@{ Hook = 'Print monitor'; Key = $k.PSChildName; Name = 'Driver'; Value = $d } } }
# Per-user screensaver
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special -and (Test-Path "Registry::HKEY_USERS\$($_.SID)\Control Panel\Desktop") })) {
    $d = Get-ItemProperty "Registry::HKEY_USERS\$($p.SID)\Control Panel\Desktop"
    if ($d.'SCRNSAVE.EXE') { [pscustomobject]@{ Hook = 'Screensaver'; Key = "User $(Split-Path $p.LocalPath -Leaf)"; Name = 'SCRNSAVE.EXE'; Value = "$($d.'SCRNSAVE.EXE') (timeout $($d.ScreenSaveTimeOut)s)" } }
}
