$Name = 'Event Logs - Task Changes'
$Description = 'Scheduled task created, deleted, enabled, disabled or updated (Security 4698 to 4702) and task registered, started or failed (TaskScheduler Operational 106, 140, 141, 200, 201). Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours. Contains filters on task name or content.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'Contains?', 'MaxEvents?')
$Tags = @('event-logs', 'persistence', 'scheduled-tasks')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$what = @{ 4698 = 'Created'; 4699 = 'Deleted'; 4700 = 'Enabled'; 4701 = 'Disabled'; 4702 = 'Updated'; 106 = 'Registered'; 140 = 'Updated'; 141 = 'Deleted'; 200 = 'Action started'; 201 = 'Action completed' }
$n = 0
foreach ($src in @(@('Security', @(4698, 4699, 4700, 4701, 4702)), @('Microsoft-Windows-TaskScheduler/Operational', @(106, 140, 141, 200, 201)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $d = Get-Data $e
        $name = if ($d['TaskName']) { $d['TaskName'] } else { $e.Properties[0].Value }
        $content = ($d['TaskContent'] -replace '\s+', ' ')
        if ($Contains -and "$name $content" -notlike "*$Contains*") { continue }
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Action = $what[$e.Id]; Task = $name; By = $(if ($d['SubjectUserName']) { "$($d['SubjectDomainName'])\$($d['SubjectUserName'])" } else { $d['UserContext'] }); ActionPath = $d['ActionName']; Content = $content.Substring(0, [Math]::Min(400, $content.Length)) }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No scheduled task events in that window.' }
