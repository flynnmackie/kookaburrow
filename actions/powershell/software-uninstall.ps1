$Name = 'Software - Uninstall'
$Description = 'Silently uninstalls a Windows Installer (MSI) program found by name in the Uninstall registry keys.'
$Dependencies = @()
$Parameters = @('ProductName')
$Tags = @('software', 'remediation')

if (-not $ProductName) { throw 'ProductName is required' }
$found = @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -eq $ProductName })
if (-not $found) { throw "No installed program named exactly: $ProductName" }
if ($found.Count -gt 1) { throw "$($found.Count) programs match $ProductName; nothing was uninstalled" }
$p = $found[0]
if ($p.PSChildName -notmatch '^\{[0-9A-Fa-f-]{36}\}$') { throw "$ProductName has no MSI product code ($($p.UninstallString)); uninstall it another way" }
Write-Output "Uninstalling $($p.DisplayName) $($p.DisplayVersion) ($($p.PSChildName))"
$r = Start-Process -FilePath msiexec.exe -ArgumentList "/x $($p.PSChildName) /qn /norestart" -Wait -PassThru
Write-Output "msiexec exit code: $($r.ExitCode) (0 = success, 3010 = success, restart needed)"
if ($r.ExitCode -notin 0, 3010) { throw "Uninstall failed with exit code $($r.ExitCode)" }
