$Name = 'Tasks - List'
$Description = 'Every scheduled task with its actions, triggers, run-as account and last run result.'
$Dependencies = @()
$Parameters = @('ExcludeMicrosoft?')
$Tags = @('persistence', 'scheduled-tasks', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$tasks = Get-ScheduledTask
if ($ExcludeMicrosoft -match '^(y|yes|true|1)$') { $tasks = $tasks | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } }
foreach ($t in $tasks) {
    $i = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath
    [pscustomobject]@{
        Path = "$($t.TaskPath)$($t.TaskName)"; State = $t.State; RunAs = $t.Principal.UserId; RunLevel = $t.Principal.RunLevel
        Actions = (($t.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)".Trim() }) -join ' ; ')
        Triggers = (($t.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task|Trigger', '' }) -join ',')
        LastRun = $i.LastRunTime; LastResult = $i.LastTaskResult; NextRun = $i.NextRunTime; Author = $t.Author
    }
}
