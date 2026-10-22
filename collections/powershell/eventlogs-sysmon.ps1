$Name = 'Sysmon - Events'
$Description = 'Events from the Sysmon log, if Sysmon is installed: process create (1), network connection (3), image loaded (7), process access (10), file create (11), registry (12 to 14), DNS query (22) and more. EventIds limits to the IDs you list (for example 1,3,22), Contains to text anywhere in the event. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 60 minutes because Sysmon is busy.'
$Dependencies = @()
$Parameters = @('EventIds?', 'Contains?', 'LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'sysmon', 'forensics', 'execution')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddMinutes(-60) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$f = @{ LogName = 'Microsoft-Windows-Sysmon/Operational'; StartTime = $start; EndTime = $end }
if ($EventIds) { $f.Id = [int[]]($EventIds -split '[,; ]+' | Where-Object { $_ }) }
try { $events = Get-WinEvent -FilterHashtable $f -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found|not an event log') { 'No Sysmon events (Sysmon not installed, or none in that window).'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    $detail = (($d.GetEnumerator() | Where-Object { $_.Key -notin 'RuleName', 'UtcTime', 'ProcessGuid', 'Image', 'User' } | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '; ')
    if ($Contains -and "$($d['Image']) $detail" -notlike "*$Contains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Image = $d['Image']; User = $d['User']; Detail = $detail.Substring(0, [Math]::Min(700, $detail.Length)) }
    if (++$n -ge $max) { break }
}
