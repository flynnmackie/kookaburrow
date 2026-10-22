$Name = 'Software - Installed'
$Description = 'Installed programs from the machine-wide and per-user Uninstall keys (64-bit and 32-bit), with version, publisher, install date and location. Look for remote access tools, packers and anything installed around the time of an incident (like Windows.Sys.Programs).'
$Dependencies = @()
$Tags = @('inventory', 'software', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$keys = @(
    @{ Scope = 'Machine'; Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' },
    @{ Scope = 'Machine (32-bit)'; Path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' }
)
$hives = @(Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special -and (Test-Path "Registry::HKEY_USERS\$($_.SID)") })
foreach ($h in $hives) { $keys += @{ Scope = "User $(Split-Path $h.LocalPath -Leaf)"; Path = "Registry::HKEY_USERS\$($h.SID)\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" } }
$apps = foreach ($k in $keys) {
    Get-ItemProperty -Path $k.Path | Where-Object { $_.DisplayName } | ForEach-Object {
        [pscustomobject]@{ Scope = $k.Scope; Name = $_.DisplayName; Version = $_.DisplayVersion; Publisher = $_.Publisher; InstallDate = $_.InstallDate; InstallLocation = $_.InstallLocation; Uninstall = $_.UninstallString }
    }
}
$apps | Sort-Object Name
