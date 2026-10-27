$Name = 'Persistence - IFEO'
$Description = 'Image File Execution Options debuggers, GlobalFlag settings and SilentProcessExit monitors.'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($base in 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Image File Execution Options') {
    foreach ($k in Get-ChildItem $base) {
        $p = Get-ItemProperty $k.PSPath
        foreach ($n in 'Debugger', 'GlobalFlag', 'VerifierDlls', 'MitigationOptions') {
            if ($null -ne $p.$n) { [pscustomobject]@{ Type = 'IFEO'; Program = $k.PSChildName; Setting = $n; Value = [string]$p.$n } }
        }
    }
}
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SilentProcessExit') {
    $p = Get-ItemProperty $k.PSPath
    foreach ($n in 'MonitorProcess', 'ReportingMode') { if ($null -ne $p.$n) { [pscustomobject]@{ Type = 'SilentProcessExit'; Program = $k.PSChildName; Setting = $n; Value = [string]$p.$n } } }
}
