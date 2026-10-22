$Name = 'Event Logs - Service Installs'
$Description = 'New and changed services: System 7045 (service installed), Security 4697 (service installed on the system) and System 7040 (start type changed). Malware and PsExec-style tools install services. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 24 hours.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'persistence', 'services', 'lateral-movement')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$n = 0
foreach ($src in @(@('System', @(7045, 7040)), @('Security', @(4697)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $d = Get-Data $e
        $p = $e.Properties
        [pscustomobject]@{
            Time = $e.TimeCreated; Id = $e.Id; Log = $src[0]
            Service = $(if ($d['ServiceName']) { $d['ServiceName'] } else { $p[0].Value }); Path = $(if ($d['ImagePath']) { $d['ImagePath'] } elseif ($d['ServiceFileName']) { $d['ServiceFileName'] } else { $p[1].Value })
            Account = $(if ($d['AccountName']) { $d['AccountName'] } elseif ($d['ServiceAccount']) { $d['ServiceAccount'] } else { '' }); StartType = $(if ($d['StartType']) { $d['StartType'] } elseif ($d['ServiceStartType']) { $d['ServiceStartType'] } else { '' })
            InstalledBy = $(if ($d['SubjectUserName']) { "$($d['SubjectDomainName'])\$($d['SubjectUserName'])" } else { $e.UserId.Value })
        }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No service events in that window.' }
