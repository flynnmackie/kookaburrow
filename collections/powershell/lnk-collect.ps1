$Name = 'Recent Files - Collect'
$Description = 'Copies every user Recent folder shortcut (.lnk) for parsing with LECmd, plus the Office Recent shortcuts.'
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
    foreach ($sub in 'AppData\Roaming\Microsoft\Windows\Recent', 'AppData\Roaming\Microsoft\Office\Recent', 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup') {
        $dst = Join-Path $OutDir "$u\$(Split-Path $sub -Leaf)"
        foreach ($f in Get-ChildItem -LiteralPath (Join-Path $p.LocalPath $sub) -Filter '*.lnk' -File -Force | Where-Object { $_.LastWriteTime -ge $since }) {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
            [pscustomobject]@{ User = $u; Folder = (Split-Path $sub -Leaf); File = $f.Name; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
        }
    }
}
