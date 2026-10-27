$Name = 'Processes - Kill by PID'
$Description = 'Stops exactly one process by its process id.'
$Dependencies = @()
$Parameters = @('ProcessId')
$Tags = @('containment', 'process')

if (-not ($ProcessId -as [int]) -or [int]$ProcessId -le 4) { throw 'ProcessId is required and must be a number above 4' }
$p = Get-Process -Id ([int]$ProcessId) -ErrorAction SilentlyContinue
if (-not $p) { Write-Output "No process with PID $ProcessId."; return }
$path = try { $p.Path } catch { '' }
Stop-Process -Id $p.Id -Force -ErrorAction Stop
Write-Output "Stopped PID $($p.Id) $($p.ProcessName) $path"
