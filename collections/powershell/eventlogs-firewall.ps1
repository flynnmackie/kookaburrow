$Name = 'Event Logs - Firewall Changes'
$Description = 'Windows Firewall rule and setting changes: rule added, modified or deleted and profile settings changed (Security 4946 to 4950, 4954 to 4958 and Windows Firewall With Advanced Security 2004, 2005, 2006, 2033). Attackers open ports and disable the firewall to move laterally or reach out. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 7 days.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'network', 'defense-evasion', 'persistence')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddDays(-7) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$n = 0
foreach ($src in @(@('Security', @(4946, 4947, 4948, 4949, 4950, 4954, 4956, 4957, 4958)), @('Microsoft-Windows-Windows Firewall With Advanced Security/Firewall', @(2004, 2005, 2006, 2033)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $m = ($e.Message -replace '\s+', ' ')
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Log = $src[0].Split('/')[0]; Message = $m.Substring(0, [Math]::Min(500, $m.Length)) }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No firewall change events in that window.' }
