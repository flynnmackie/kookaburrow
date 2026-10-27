$Name = 'Yara - Scan Files'
$Description = 'Scans files in a folder with YARA rules and returns the files that match and which rule matched.'
$Dependencies = @('yara64.exe', 'kb-rules.yar')
$Parameters = @('ScanPath', 'Recurse?')
$Tags = @('malware', 'filesystem', 'forensics')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'yara64.exe'
$rules = Join-Path $BinDir 'kb-rules.yar'
$a = @('-w', '-N')
if ($Recurse -notmatch '^(n|no|false|0)$') { $a += '-r' }
$hits = 0
foreach ($l in (& $exe @a $rules $ScanPath 2>&1)) {
    if ($l -match '^(\S+)\s+(.+)$') { $hits++; [pscustomobject]@{ Rule = $Matches[1]; Path = $Matches[2].Trim(); Sha256 = $(if (Test-Path -LiteralPath $Matches[2].Trim() -PathType Leaf) { (Get-FileHash -LiteralPath $Matches[2].Trim() -Algorithm SHA256).Hash } else { '' }) } }
    elseif ($l -match 'error') { throw "$l" }
}
if (-not $hits) { 'No YARA matches.' }
