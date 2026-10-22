$Name = 'Tasks - Delete'
$Description = 'Deletes a scheduled task. Its definition is exported to C:\ProgramData\Kookaburrow\Quarantine as XML first so it can be restored or analysed. TaskName is the task name; TaskPath is the folder (default the root folder).'
$Dependencies = @()
$Parameters = @('TaskName', 'TaskPath?')
$Tags = @('persistence', 'scheduled-tasks', 'remediation')

if (-not $TaskName) { throw 'TaskName is required' }
$path = if ($TaskPath) { $TaskPath } else { '\' }
if (-not $path.EndsWith('\')) { $path += '\' }
$null = Get-ScheduledTask -TaskName $TaskName -TaskPath $path -ErrorAction Stop
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$xml = Join-Path $dir ('{0:yyyyMMdd-HHmmss}_task_{1}.xml' -f (Get-Date), ($TaskName -replace '[\\/:*?"<>|]', '_'))
Export-ScheduledTask -TaskName $TaskName -TaskPath $path | Set-Content -LiteralPath $xml -Encoding UTF8
Unregister-ScheduledTask -TaskName $TaskName -TaskPath $path -Confirm:$false -ErrorAction Stop
Write-Output "Deleted task $path$TaskName"
Write-Output "Definition saved to: $xml"
