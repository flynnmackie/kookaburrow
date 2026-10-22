$Name = 'Processes - Kill Tree'
$Description = 'Stops a process and everything it started (all child and grandchild processes), by process id. Use it when malware spawns helpers that would restart the parent. Refuses system PIDs (4 and below).'
$Dependencies = @()
$Parameters = @('ProcessId')
$Tags = @('containment', 'process')

if (-not ($ProcessId -as [int]) -or [int]$ProcessId -le 4) { throw 'ProcessId is required and must be a number above 4' }
$all = Get-CimInstance Win32_Process
function Get-Kids($id) { foreach ($c in $all | Where-Object { $_.ParentProcessId -eq $id -and $_.ProcessId -ne $id }) { Get-Kids $c.ProcessId; $c } }
$root = $all | Where-Object { $_.ProcessId -eq [int]$ProcessId }
if (-not $root) { Write-Output "No process with PID $ProcessId."; return }
$victims = @(Get-Kids ([int]$ProcessId)) + @($root)
foreach ($v in $victims) {
    Stop-Process -Id $v.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped PID $($v.ProcessId) $($v.Name) $($v.CommandLine)"
}
