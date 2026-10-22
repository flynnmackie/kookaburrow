$Name = 'Event Logs - Share Access'
$Description = 'Network share access: a share was accessed (5140), a file or folder was accessed over SMB (5145), and share created, changed or deleted (5142, 5143, 5144). Shows who touched which admin share (C$, ADMIN$, IPC$) from where, which is how PsExec and lateral movement look. Needs object access auditing. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'ShareContains?', 'MaxEvents?')
$Tags = @('event-logs', 'smb', 'lateral-movement')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = @(5140, 5142, 5143, 5144, 5145); StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No share events in that window (is File Share auditing enabled?).'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    if ($ShareContains -and "$($d['ShareName'])" -notlike "*$ShareContains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; User = "$($d['SubjectDomainName'])\$($d['SubjectUserName'])"; ClientIp = ($d['IpAddress'] -replace '^::ffff:', ''); Share = $d['ShareName']; Target = $d['RelativeTargetName']; Access = $d['AccessMask']; Result = $d['AccessReason'] }
    if (++$n -ge $max) { break }
}
