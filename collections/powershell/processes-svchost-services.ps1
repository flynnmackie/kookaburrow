$Name = 'Processes - Service Host Groups'
$Description = 'Which services run inside each svchost.exe process and under which account. A service that should not share a host, or a svchost with no services, is suspicious.'
$Dependencies = @()
$Tags = @('processes', 'services', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$svc = Get-CimInstance Win32_Service | Where-Object { $_.State -eq 'Running' -and $_.ProcessId }
Get-CimInstance Win32_Process -Filter "Name='svchost.exe'" | ForEach-Object { $id = $_.ProcessId; $s = @($svc | Where-Object { $_.ProcessId -eq $id }); [pscustomobject]@{ Pid = $id; ServiceCount = $s.Count; Services = (($s | ForEach-Object { $_.Name }) -join ', '); CommandLine = $_.CommandLine; Parent = $_.ParentProcessId } }
