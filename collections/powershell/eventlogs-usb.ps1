$Name = 'Event Logs - USB'
$Description = 'USB device plug-in and removal events from the DriverFrameworks-UserMode (2003, 2100, 2101, 2102, 2105, 2106) and Kernel-PnP logs. Shows when removable media were attached and which device. Set LastMinutes for the last N minutes or StartTime and EndTime (yyyy-MM-dd HH:mm) for a range; default is 7 days. USB - History reads the registry for older activity.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'MaxEvents?')
$Tags = @('event-logs', 'forensics', 'inventory')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddDays(-7) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$n = 0
foreach ($src in @(@('Microsoft-Windows-DriverFrameworks-UserMode/Operational', @(2003, 2100, 2101, 2102, 2105, 2106)), @('Microsoft-Windows-Kernel-PnP/Configuration', @(400, 410, 411)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $m = ($e.Message -replace '\s+', ' ')
        if ($m -notmatch 'USB\\|USBSTOR|WPD\\|Removable') { continue }
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Log = ($src[0] -replace 'Microsoft-Windows-|/.*', ''); Message = $m.Substring(0, [Math]::Min(400, $m.Length)) }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No USB events in that window (the DriverFrameworks log is often disabled).' }
