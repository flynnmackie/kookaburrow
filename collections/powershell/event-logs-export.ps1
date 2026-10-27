$Name = 'Event Logs - Export'
$Description = 'Exports event logs as .evtx files and pulls them back to the server for analysis in tools such as Event Log Explorer, Hayabusa or Chainsaw.'
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
