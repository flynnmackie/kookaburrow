$Name = 'Yara - Scan Files'
$Description = 'Scans files in a folder with YARA rules and returns the files that match and which rule matched. Choose the rules with YaraRule: the enabled rule files (the default), one rule file from the server (the built-in ones list every executable, unsigned or packed programs, archives, secrets and more), or write your own. SHA-256 is added when there are 500 matches or fewer.'
$Dependencies = @('yara64.exe', 'kb-rules.yar')
$Parameters = @('ScanPath', 'Recurse?', 'YaraRule?')
$Tags = @('malware', 'filesystem', 'forensics')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'yara64.exe'
$rules = Join-Path $BinDir 'kb-rules.yar'
$a = @('-w', '-N')
if ($Recurse -notmatch '^(n|no|false|0)$') { $a += '-r' }
$found = @()
foreach ($l in (& $exe @a $rules $ScanPath 2>&1)) {
    if ($l -match '^(\S+)\s+(.+)$') { $found += [pscustomobject]@{ Rule = $Matches[1]; Path = $Matches[2].Trim() } }
    elseif ($l -match 'error') { throw "$l" }
}
foreach ($f in $found) {
    $hash = ''
    if ($found.Count -le 500 -and (Test-Path -LiteralPath $f.Path -PathType Leaf)) { $hash = (Get-FileHash -LiteralPath $f.Path -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash }
    [pscustomobject]@{ Rule = $f.Rule; Path = $f.Path; Sha256 = $hash }
}
if (-not $found.Count) { 'No YARA matches.' }
