$Name = 'Tasks - Disable'
$Description = 'Disables a scheduled task so it no longer runs, without deleting it (reversible). TaskName is the task name; TaskPath is the folder, for example \Microsoft\Windows\Foo\ (default the root folder). Use Tasks - List to find the exact name and path.'
$Dependencies = @()
$Parameters = @('TaskName', 'TaskPath?')
$Tags = @('persistence', 'scheduled-tasks', 'containment')

if (-not $TaskName) { throw 'TaskName is required' }
$path = if ($TaskPath) { $TaskPath } else { '\' }
if (-not $path.EndsWith('\')) { $path += '\' }
$t = Get-ScheduledTask -TaskName $TaskName -TaskPath $path -ErrorAction Stop
Disable-ScheduledTask -TaskName $TaskName -TaskPath $path -ErrorAction Stop | Out-Null
Write-Output "Disabled task $path$TaskName (was $($t.State)). Actions: $(($t.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join ' ; ')"
