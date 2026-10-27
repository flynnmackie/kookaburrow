$Name = 'Files - Collect'
$Description = 'Copies chosen files back to the server, keeping their folder structure.'
$Dependencies = @()
$Parameters = @('SourcePath', 'Recurse?', 'MaxFileMB?', 'ModifiedDays?')
$Tags = @('filesystem', 'forensics', 'malware')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$maxBytes = $(if ($MaxFileMB -match '^\d+$') { [int64]$MaxFileMB } else { 200 }) * 1MB
$since = if ($ModifiedDays -match '^\d+$') { (Get-Date).AddDays(-[int]$ModifiedDays) } else { [datetime]::MinValue }
$gci = @{ Path = $SourcePath; Force = $true; File = $true }
if ($Recurse -match '^(y|yes|true|1)$') { $gci.Recurse = $true }
$items = @(Get-ChildItem @gci)
if (-not $items) { throw "Nothing matched $SourcePath" }
foreach ($f in $items) {
    $skip = ''
    if ($f.Length -gt $maxBytes) { $skip = "larger than $([math]::Round($maxBytes / 1MB)) MB" } elseif ($f.LastWriteTime -lt $since) { $skip = 'older than ModifiedDays' }
    $rel = ($f.FullName -replace '^([A-Za-z]):', '$1') -replace '^\\\\', 'UNC\'
    $dst = Join-Path $OutDir $rel
    $copied = $false
    if (-not $skip) {
        New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
        try { Copy-Item -LiteralPath $f.FullName -Destination $dst -Force -ErrorAction Stop; $copied = $true } catch { $null = esentutl.exe /y $f.FullName /vss /d $dst 2>&1; $copied = (Test-Path -LiteralPath $dst) }
    }
    [pscustomobject]@{ Path = $f.FullName; SizeBytes = $f.Length; Modified = $f.LastWriteTime; Sha256 = $(if ($copied) { (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash } else { '' }); Copied = $copied; Skipped = $skip }
}
