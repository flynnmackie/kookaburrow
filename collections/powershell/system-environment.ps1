$Name = 'System - Environment Variables'
$Description = 'Machine-wide and per-user environment variables. Attackers abuse PATH, COMSPEC, PSModulePath and user TEMP locations to hijack execution.'
$Dependencies = @()
$Tags = @('persistence', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$k = Get-Item 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
foreach ($n in $k.GetValueNames()) { [pscustomobject]@{ Scope = 'Machine'; User = ''; Name = $n; Value = [string]$k.GetValue($n, $null, 'DoNotExpandEnvironmentNames') } }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special -and (Test-Path "Registry::HKEY_USERS\$($_.SID)\Environment") })) {
    $u = Get-Item "Registry::HKEY_USERS\$($p.SID)\Environment"
    foreach ($n in $u.GetValueNames()) { [pscustomobject]@{ Scope = 'User'; User = (Split-Path $p.LocalPath -Leaf); Name = $n; Value = [string]$u.GetValue($n, $null, 'DoNotExpandEnvironmentNames') } }
}
