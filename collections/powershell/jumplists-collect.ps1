$Name = 'Jump Lists - Collect'
$Description = 'Copies every user Jump List file (AutomaticDestinations and CustomDestinations) for parsing with JLECmd. They record files recently opened with each application, including from removable and network locations. Set Days to copy only files changed in the last N days. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('execution', 'forensics', 'filesystem')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$since = if ($Days -match '^\d+$') { (Get-Date).AddDays(-[int]$Days) } else { [datetime]::MinValue }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($sub in 'AutomaticDestinations', 'CustomDestinations') {
        $dst = Join-Path $OutDir "$u\$sub"
        foreach ($f in Get-ChildItem -LiteralPath "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\Recent\$sub" -File -Force | Where-Object { $_.LastWriteTime -ge $since }) {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
            [pscustomobject]@{ User = $u; Type = $sub; File = $f.Name; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
        }
    }
}
