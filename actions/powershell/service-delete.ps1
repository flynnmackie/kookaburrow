$Name = 'Services - Delete'
$Description = 'Stops a service and deletes its registration (sc delete).'
$Dependencies = @()
$Parameters = @('ServiceName')
$Tags = @('persistence', 'services', 'remediation')

if (-not $ServiceName -or $ServiceName -match '[\*\?\\/]') { throw 'ServiceName is required (the short name, no wildcards)' }
$protected = 'RpcSs', 'RpcEptMapper', 'DcomLaunch', 'LSM', 'SamSs', 'EventLog', 'Winmgmt', 'WinRM', 'LanmanServer', 'LanmanWorkstation', 'Dhcp', 'Dnscache', 'BFE', 'MpsSvc', 'CryptSvc', 'TrustedInstaller', 'wuauserv', 'Schedule', 'W32Time', 'Netlogon', 'NTDS', 'DNS', 'KDC'
if ($ServiceName -in $protected) { throw "Refusing to delete the core service $ServiceName" }
$s = Get-CimInstance Win32_Service -Filter "Name='$($ServiceName -replace "'", "''")'"
if (-not $s) { throw "No service named $ServiceName" }
Write-Output "Service: $($s.Name) ($($s.DisplayName)) path: $($s.PathName) account: $($s.StartName)"
Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
$o = sc.exe delete $ServiceName 2>&1 | Out-String
Write-Output $o.Trim()
if ($LASTEXITCODE -ne 0) { throw 'sc delete failed' }
