$Name = 'Files - Recently Changed'
$Description = 'Files created or modified in the last N minutes under a folder (default the whole system drive), newest first, with the creation and modification times and hashes. LastMinutes defaults to 60. Exclude is an optional text that paths must not contain (for example \Windows\WinSxS). Quick way to see what an attacker touched just now. Can be slow on a whole drive: narrow SearchPath when you can.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'SearchPath?', 'Exclude?', 'Hash?', 'MaxResults?')
$Tags = @('filesystem', 'forensics', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$mins = if ($LastMinutes -match '^\d+$') { [int]$LastMinutes } else { 60 }
$root = if ($SearchPath) { $SearchPath } else { "$env:SystemDrive\" }
$max = if ($MaxResults -match '^\d+$') { [int]$MaxResults } else { 2000 }
$since = (Get-Date).AddMinutes(-$mins)
$rows = Get-ChildItem -LiteralPath $root -Recurse -Force -File | Where-Object { ($_.LastWriteTime -ge $since -or $_.CreationTime -ge $since) -and (-not $Exclude -or $_.FullName -notlike "*$Exclude*") } | Sort-Object LastWriteTime -Descending | Select-Object -First $max
foreach ($f in $rows) {
    [pscustomobject]@{ Path = $f.FullName; SizeBytes = $f.Length; Created = $f.CreationTime; Modified = $f.LastWriteTime; Sha256 = $(if ($Hash -match '^(y|yes|true|1)$') { (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash } else { '' }) }
}
