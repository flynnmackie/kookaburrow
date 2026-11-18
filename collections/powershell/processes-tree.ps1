$Name = 'Processes - Tree with Command Lines'
$Description = 'Every process with its parent, owner, path and full command line, so the parent and child relationships can be read (Office starting a shell, a service starting cmd).'
$Dependencies = @()
$Tags = @('processes', 'execution', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$p = Get-CimInstance Win32_Process; $by = @{}; foreach ($x in $p) { $by[[int]$x.ProcessId] = $x }
foreach ($x in $p) { $par = $by[[int]$x.ParentProcessId]
 [pscustomobject]@{ Name = $x.Name; Pid = $x.ProcessId; Parent = $(if ($par) { $par.Name } else { '' }); ParentPid = $x.ParentProcessId; Session = $x.SessionId; Path = $x.ExecutablePath; CommandLine = $x.CommandLine; Started = $x.CreationDate } }
