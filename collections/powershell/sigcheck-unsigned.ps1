$Name = 'Files - Unsigned Executables'
$Description = 'Scans a folder with Sysinternals Sigcheck and returns executables and DLLs that are not signed (or whose signature is invalid), with hashes, publisher and version information. ScanPath is the folder (default C:\Windows\System32); set Recurse to no for just that folder. Unsigned files in system folders and in user-writable folders are strong leads. Needs the sigcheck64.exe single-file binary uploaded under Settings, Binaries.'
$Dependencies = @('sigcheck64.exe')
$Parameters = @('ScanPath?', 'Recurse?')
$Tags = @('signing', 'malware', 'filesystem')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'sigcheck64.exe'
$path = if ($ScanPath) { $ScanPath } else { "$env:SystemRoot\System32" }
$a = @('-accepteula', '-nobanner', '-c', '-h', '-e', '-u')
if ($Recurse -notmatch '^(n|no|false|0)$') { $a += '-s' }
$out = & $exe @a $path 2>$null
$rows = $out | ConvertFrom-Csv
if (-not $rows) { 'No unsigned executables found.'; return }
$rows | ForEach-Object { [pscustomobject]@{ Path = $_.Path; Verified = $_.Verified; SignDate = $_.Date; Publisher = $_.Publisher; Company = $_.Company; Description = $_.Description; Product = $_.Product; FileVersion = $_.'File Version'; Machine = $_.'Machine Type'; Sha256 = $_.SHA256; Md5 = $_.MD5 } }
