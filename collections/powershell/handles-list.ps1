$Name = 'Processes - Open Handles'
$Description = 'Open handles (files, registry keys, mutexes, pipes, events) for running processes, from Sysinternals Handle. Needs administrator rights.'
$Dependencies = @('handle64.exe')
$Parameters = @('ProcessName?', 'Contains?')
$Tags = @('processes', 'forensics', 'malware')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'handle64.exe'
$a = @('-accepteula', '-nobanner', '-a', '-v')
if ($ProcessName) { $a += @('-p', $ProcessName) }
$lines = @(& $exe @a 2>$null)
if (-not $lines) { throw 'Handle returned nothing (administrator rights are required)' }
$hdr = $lines | Where-Object { $_ -match '^"?Process"?,' } | Select-Object -First 1
if ($hdr) {
    $rows = $lines | Where-Object { $_ -ne $hdr -and $_ } | ForEach-Object { $_ } | ConvertFrom-Csv -Header ($hdr -split ',' | ForEach-Object { $_.Trim('"') })
    foreach ($r in $rows) { $text = ($r.PSObject.Properties.Value -join ' '); if ($Contains -and $text -notlike "*$Contains*") { continue }; $r }
} else {
    foreach ($l in $lines) { if ($l -and (-not $Contains -or $l -like "*$Contains*")) { [pscustomobject]@{ Output = $l } } }
}
