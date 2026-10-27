$Name = 'Event Logs - Query'
$Description = 'Reads any event log with filters.'
$Dependencies = @()
$Parameters = @('LogName', 'EventIds?', 'Contains?', 'LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'forensics')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$f = @{ LogName = $LogName; StartTime = $start; EndTime = $end }
if ($EventIds) { $f.Id = [int[]]($EventIds -split '[,; ]+' | Where-Object { $_ }) }
try { $events = Get-WinEvent -FilterHashtable $f -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No events in that window.'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $m = ($e.Message -replace '\s+', ' ')
    if ($Contains -and $m -notlike "*$Contains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Level = $e.LevelDisplayName; Provider = $e.ProviderName; Computer = $e.MachineName; User = $e.UserId.Value; Message = $m.Substring(0, [Math]::Min(500, $m.Length)) }
    if (++$n -ge $max) { break }
}
