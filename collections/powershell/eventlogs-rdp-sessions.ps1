$Name = 'RDP - Sessions'
$Description = 'Remote Desktop session lifecycle from the Terminal Services logs: connection attempts with the client address (RemoteConnectionManager 1149), session logon, logoff, disconnect and reconnect (LocalSessionManager 21, 22, 23, 24, 25, 39, 40). Complements RDP - Logons, which reads the Security log. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'rdp', 'lateral-movement', 'logons')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$what = @{ 1149 = 'Authentication succeeded'; 21 = 'Session logon'; 22 = 'Shell start'; 23 = 'Session logoff'; 24 = 'Session disconnected'; 25 = 'Session reconnected'; 39 = 'Disconnected by another session'; 40 = 'Disconnected (reason code)' }
$n = 0
foreach ($src in @(@('Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational', @(1149)), @('Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', @(21, 22, 23, 24, 25, 39, 40)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $x = ([xml]$e.ToXml()).Event.UserData.ChildNodes[0]
        $user = if ($x.User) { $x.User } elseif ($x.Param1) { "$($x.Param2)\$($x.Param1)" } else { '' }
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Event = $what[$e.Id]; User = $user; SourceIp = $(if ($x.Address) { $x.Address } elseif ($x.Param3) { $x.Param3 } else { '' }); SessionId = $x.SessionID }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No RDP session events in that window.' }
