$Name = 'Event Logs - Summary'
$Description = 'Every event log with its record count, size, oldest and newest event time, whether it is enabled and whether it wraps.'
$Dependencies = @()
$Parameters = @('OnlyWithEvents?')
$Tags = @('event-logs', 'inventory', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$logs = Get-WinEvent -ListLog *
if ($OnlyWithEvents -match '^(y|yes|true|1)$') { $logs = $logs | Where-Object { $_.RecordCount } }
foreach ($l in $logs | Sort-Object RecordCount -Descending) {
    $first = $null
    if ($l.RecordCount) { $first = (Get-WinEvent -LogName $l.LogName -MaxEvents 1 -Oldest -ErrorAction SilentlyContinue).TimeCreated }
    [pscustomobject]@{ Log = $l.LogName; Enabled = $l.IsEnabled; Records = $l.RecordCount; SizeMB = [math]::Round($l.FileSize / 1MB, 2); MaxMB = [math]::Round($l.MaximumSizeInBytes / 1MB, 1); Mode = $l.LogMode; Oldest = $first; LastWrite = $l.LastWriteTime }
}
