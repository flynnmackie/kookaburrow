$Name = 'Files - Hash'
$Description = 'Computes hashes (SHA-256 by default; MD5, SHA1, SHA384 or SHA512 with Algorithm) of one file or every file in a folder, with size and modified time. Use it to check a file against a known-bad list or to confirm a binary is the same on every host. TargetPath is required; set Recurse to yes to include subfolders.'
$Dependencies = @()
$Parameters = @('TargetPath', 'Algorithm?', 'Recurse?')
$Tags = @('filesystem', 'forensics', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$alg = if ($Algorithm) { $Algorithm.ToUpper() } else { 'SHA256' }
if ($alg -notin 'MD5', 'SHA1', 'SHA256', 'SHA384', 'SHA512') { throw "Unsupported algorithm $Algorithm (use MD5, SHA1, SHA256, SHA384 or SHA512)" }
$gci = @{ LiteralPath = $TargetPath; Force = $true; File = $true }
if ($Recurse -match '^(y|yes|true|1)$') { $gci.Recurse = $true }
Get-ChildItem @gci | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; Algorithm = $alg; Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm $alg).Hash; SizeBytes = $_.Length; Modified = $_.LastWriteTime } }
