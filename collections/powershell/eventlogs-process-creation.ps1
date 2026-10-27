$Name = 'Event Logs - Process Creation'
$Description = 'Process creation events: Security 4688 (needs process auditing; includes the command line only if command-line auditing is on) and Sysmon event 1 when Sysmon is installed. Needs administrator rights.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'Contains?', 'MaxEvents?')
$Tags = @('event-logs', 'execution', 'processes')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$n = 0
foreach ($src in @(@('Security', 4688), @('Microsoft-Windows-Sysmon/Operational', 1))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $d = Get-Data $e
        $img = if ($src[1] -eq 1) { $d['Image'] } else { $d['NewProcessName'] }
        $cmd = if ($src[1] -eq 1) { $d['CommandLine'] } else { $d['CommandLine'] }
        if ($Contains -and "$img $cmd" -notlike "*$Contains*") { continue }
        [pscustomobject]@{ Time = $e.TimeCreated; Source = $(if ($src[1] -eq 1) { 'Sysmon' } else { 'Security 4688' }); Image = $img; CommandLine = $cmd; Parent = $(if ($src[1] -eq 1) { $d['ParentImage'] } else { $d['ParentProcessName'] }); User = $(if ($src[1] -eq 1) { $d['User'] } else { "$($d['SubjectDomainName'])\$($d['SubjectUserName'])" }); Pid = $(if ($src[1] -eq 1) { $d['ProcessId'] } else { $d['NewProcessId'] }); Hashes = $d['Hashes'] }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No process creation events in that window (is process auditing or Sysmon enabled?).' }
