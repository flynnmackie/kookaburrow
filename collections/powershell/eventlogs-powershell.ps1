$Name = 'Event Logs - PowerShell'
$Description = 'PowerShell script block logging (4104), module and pipeline logging (4103) and classic engine start events (400, 403 in the Windows PowerShell log).'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'Contains?', 'MaxEvents?')
$Tags = @('event-logs', 'powershell', 'execution')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
$n = 0
foreach ($src in @(@('Microsoft-Windows-PowerShell/Operational', @(4104, 4103)), @('Windows PowerShell', @(400, 403)))) {
    try { $events = Get-WinEvent -FilterHashtable @{ LogName = $src[0]; Id = $src[1]; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { continue }
    foreach ($e in $events) {
        $text = if ($e.Id -eq 4104) { [string]$e.Properties[2].Value } else { ($e.Message -replace '\s+', ' ') }
        if ($Contains -and $text -notlike "*$Contains*") { continue }
        [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Kind = $(switch ($e.Id) { 4104 { 'ScriptBlock' } 4103 { 'Pipeline' } 400 { 'EngineStart' } default { 'EngineStop' } }); Path = $(if ($e.Id -eq 4104) { $e.Properties[4].Value } else { '' }); User = $e.UserId.Value; Text = ($text -replace '\s+', ' ').Substring(0, [Math]::Min(700, ($text -replace '\s+', ' ').Length)) }
        if (++$n -ge $max) { break }
    }
}
if (-not $n) { 'No PowerShell events in that window (is script block logging enabled?).' }
