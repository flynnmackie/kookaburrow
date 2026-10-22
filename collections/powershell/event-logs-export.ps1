$Name = 'Event Logs - Export'
$Description = 'Exports event logs as .evtx files and pulls them back to the server for analysis in tools such as Event Log Explorer, Hayabusa or Chainsaw. LogNames is a comma separated list (default Security,System,Application; for example Security,Microsoft-Windows-PowerShell/Operational,Microsoft-Windows-Sysmon/Operational), or All for every log that has events. Set LastMinutes for only the last N minutes, or StartTime and EndTime (yyyy-MM-dd HH:mm, host local time) for a range; with none of them the whole log is exported. Files can be hundreds of MB, so they come back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('LogNames?', 'LastMinutes?', 'StartTime?', 'EndTime?')
$Tags = @('event-logs', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

# $OutDir is the temporary folder on the host that Kookaburrow pulls back afterwards and then removes.
$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$names = if ($LogNames -match '^\s*all\s*$') { @(Get-WinEvent -ListLog * | Where-Object { $_.RecordCount } | ForEach-Object { $_.LogName }) } elseif ($LogNames) { @($LogNames -split '\s*,\s*' | Where-Object { $_ }) } else { @('Security', 'System', 'Application') }
$query = '*'
if ($StartTime -or $EndTime -or $LastMinutes) {
    $end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
    $start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { [datetime]::new(2000, 1, 1) }
    $query = "*[System[TimeCreated[@SystemTime>='{0}' and @SystemTime<='{1}']]]" -f $start.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'), $end.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z')
}
foreach ($log in $names) {
    $file = Join-Path $OutDir (($log -replace '[\\/:*?"<>|]', '%4') + '.evtx')
    $out = wevtutil epl $log $file /q:$query /ow:true 2>&1
    $ok = Test-Path -LiteralPath $file
    [pscustomobject]@{ Log = $log; Exported = $ok; SizeMB = $(if ($ok) { [math]::Round((Get-Item -LiteralPath $file).Length / 1MB, 2) } else { 0 }); Error = $(if (-not $ok) { ($out | Out-String).Trim() } else { '' }) }
}
