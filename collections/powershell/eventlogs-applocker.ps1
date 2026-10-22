$Name = 'Event Logs - AppLocker and WDAC'
$Description = 'Blocked and audited program execution from AppLocker (EXE and DLL, MSI and Script, Packaged app logs: 8003, 8004, 8006, 8007) and Windows Defender Application Control code integrity (3076, 3077). Shows what an application control policy stopped or would have stopped. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'execution', 'defense-evasion')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$n = 0
foreach ($src in @(@('Microsoft-Windows-AppLocker/EXE and DLL', @(8003, 8004)), @('Microsoft-Windows-AppLocker/MSI and Script', @(8006, 8007)), @('Microsoft-Windows-CodeIntegrity/Operational', @(3076, 3077)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $m = ($e.Message -replace '\s+', ' ')
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Log = ($src[0] -replace 'Microsoft-Windows-', ''); User = $e.UserId.Value; Message = $m.Substring(0, [Math]::Min(500, $m.Length)) }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No AppLocker or code integrity events in that window.' }
