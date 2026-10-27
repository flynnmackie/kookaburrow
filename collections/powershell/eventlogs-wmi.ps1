$Name = 'Event Logs - WMI Activity'
$Description = 'WMI activity events: operations started (5857), permanent event subscriptions registered (5860, 5861) and errors (5858).'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'Contains?', 'MaxEvents?')
$Tags = @('event-logs', 'wmi', 'persistence', 'lateral-movement')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WMI-Activity/Operational'; Id = @(5857, 5858, 5859, 5860, 5861); StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No WMI activity events in that window.'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $m = ($e.Message -replace '\s+', ' ')
    if ($Contains -and $m -notlike "*$Contains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; User = $e.UserId.Value; Message = $m.Substring(0, [Math]::Min(600, $m.Length)) }
    if (++$n -ge $max) { break }
}
