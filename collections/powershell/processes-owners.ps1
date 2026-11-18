$Name = 'Processes - Owners and Session'
$Description = 'Running processes grouped with the account that owns them, the session and the number of threads and handles. Finds user processes running as SYSTEM and the reverse.'
$Dependencies = @()
$Tags = @('processes', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$cim = @{}; foreach ($x in (Get-CimInstance Win32_Process)) { $cim[[int]$x.ProcessId] = $x }
tasklist /v /fo csv 2>&1 | ConvertFrom-Csv | ForEach-Object { $x = $cim[[int]$_.PID]; [pscustomobject]@{ Name = $_.'Image Name'; Pid = $_.PID; Owner = $_.'User Name'; Session = $_.'Session#'; Threads = $(if ($x) { $x.ThreadCount } else { '' }); Handles = $(if ($x) { $x.HandleCount } else { '' }); Path = $(if ($x) { $x.ExecutablePath } else { '' }) } }
