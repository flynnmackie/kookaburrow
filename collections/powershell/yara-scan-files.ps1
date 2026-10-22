$Name = 'Yara - Scan Files'
$Description = 'Scans files in a folder with YARA rules and returns the files that match and which rule matched. ScanPath is a file or folder (set Recurse to no for just that folder). The rules come from the kb-rules.yar file you upload under Settings, Binaries (any YARA rules text), and the yara64.exe single-file binary must be uploaded there too. Use it to sweep many hosts for a family or an indicator.'
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
