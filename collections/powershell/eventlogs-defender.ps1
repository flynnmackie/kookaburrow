$Name = 'Event Logs - Defender'
$Description = 'Microsoft Defender detections and actions: malware detected (1116, 1006), action taken (1117, 1007), remediation failed (1118, 1119, 1008), real-time protection turned off (5001), configuration changed (5007) and exclusion added (5007 with an Exclusions path). Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'antivirus', 'malware', 'defense-evasion')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$what = @{ 1006 = 'Malware detected'; 1007 = 'Action taken'; 1008 = 'Action failed'; 1015 = 'Suspicious behaviour'; 1116 = 'Malware detected'; 1117 = 'Action taken'; 1118 = 'Remediation failed'; 1119 = 'Remediation critical failure'; 5001 = 'Real-time protection disabled'; 5004 = 'Real-time config changed'; 5007 = 'Configuration changed'; 5010 = 'Scanning disabled'; 5012 = 'Virus scanning disabled' }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Windows Defender/Operational'; Id = [int[]]$what.Keys; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No Defender events in that window.'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Event = $what[$e.Id]; Threat = $d['Threat Name']; Severity = $d['Severity Name']; Path = $d['Path']; Process = $d['Process Name']; User = $d['Detection User']; Action = $d['Action Name']; Detail = $(if ($e.Id -in 5007, 5004) { ($e.Message -replace '\s+', ' ') } else { '' }) }
    if (++$n -ge $max) { break }
}
