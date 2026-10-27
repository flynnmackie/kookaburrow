$Name = 'Prefetch - Collect'
$Description = 'Copies the raw Prefetch files (.pf) from C:\Windows\Prefetch back to the server for parsing with PECmd, WinPrefetchView or Prefetch - Parse.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('execution', 'forensics', 'prefetch')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$since = if ($Days -match '^\d+$') { (Get-Date).AddDays(-[int]$Days) } else { [datetime]::MinValue }
$dst = Join-Path $OutDir 'Prefetch'
New-Item -ItemType Directory -Path $dst -Force | Out-Null
$files = @(Get-ChildItem -LiteralPath "$env:SystemRoot\Prefetch" -Force -File | Where-Object { $_.LastWriteTime -ge $since })
if (-not $files) { throw "No Prefetch files found in $env:SystemRoot\Prefetch (Prefetch may be disabled)" }
foreach ($f in $files) {
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    [pscustomobject]@{ File = $f.Name; SizeBytes = $f.Length; Modified = $f.LastWriteTime; Copied = (Test-Path -LiteralPath (Join-Path $dst $f.Name)) }
}
