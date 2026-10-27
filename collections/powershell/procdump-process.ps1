$Name = 'Memory - Process Dump'
$Description = 'Takes a full memory dump of one process with Sysinternals ProcDump and brings the .dmp file back for analysis with Volatility, WinDbg or strings. Needs administrator rights.'
$Dependencies = @('procdump64.exe')
$Parameters = @('Target')
$Tags = @('forensics', 'processes', 'malware')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'tool'
$Transfer = 'large'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'procdump64.exe'
$o = & $exe -accepteula -ma $Target $OutDir 2>&1 | Out-String
$dumps = @(Get-ChildItem -LiteralPath $OutDir -Filter '*.dmp' -File)
if (-not $dumps) { throw "ProcDump produced no dump: $($o.Trim())" }
foreach ($d in $dumps) { [pscustomobject]@{ Target = $Target; Dump = $d.Name; SizeMB = [math]::Round($d.Length / 1MB, 1); Created = $d.CreationTime } }
