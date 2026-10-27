$Name = 'Files - Search'
$Description = 'Finds files under a folder by name pattern (wildcards, for example *.ps1 or invoice*.exe), with optional size limits, only files changed in the last N days, and SHA-256 hashes.'
$Dependencies = @()
$Parameters = @('SearchPath', 'Pattern?', 'ModifiedDays?', 'MinSizeKB?', 'MaxSizeKB?', 'Recurse?', 'Hash?', 'MaxResults?')
$Tags = @('filesystem', 'forensics', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$pat = if ($Pattern) { $Pattern } else { '*' }
$max = if ($MaxResults -match '^\d+$') { [int]$MaxResults } else { 5000 }
$rec = $Recurse -notmatch '^(n|no|false|0)$'
$since = if ($ModifiedDays -match '^\d+$') { (Get-Date).AddDays(-[int]$ModifiedDays) } else { [datetime]::MinValue }
$gci = @{ LiteralPath = $SearchPath; Filter = $pat; Force = $true; File = $true }
if ($rec) { $gci.Recurse = $true }
Get-ChildItem @gci | Where-Object { $_.LastWriteTime -ge $since -and (-not $MinSizeKB -or $_.Length -ge ([double]$MinSizeKB * 1KB)) -and (-not $MaxSizeKB -or $_.Length -le ([double]$MaxSizeKB * 1KB)) } | Select-Object -First $max | ForEach-Object {
    [pscustomobject]@{ Path = $_.FullName; SizeBytes = $_.Length; Created = $_.CreationTime; Modified = $_.LastWriteTime; Accessed = $_.LastAccessTime; Attributes = $_.Attributes; Owner = (Get-Acl -LiteralPath $_.FullName).Owner; Sha256 = $(if ($Hash -match '^(y|yes|true|1)$') { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } else { '' }) }
}
