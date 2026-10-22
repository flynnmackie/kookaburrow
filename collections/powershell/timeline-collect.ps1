$Name = 'Windows Timeline - Collect'
$Description = 'Copies the Windows Timeline / Activity History database (ActivitiesCache.db) of every user, with its write-ahead log files, for analysis with WxTCmd or SQLite. It records applications opened, files and web pages visited and clipboard use, with start and end times, for up to 30 days on Windows 10 and some builds of Windows 11. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Tags = @('forensics', 'execution', 'filesystem')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($dir in Get-ChildItem -LiteralPath "$($p.LocalPath)\AppData\Local\ConnectedDevicesPlatform" -Directory -Force) {
        foreach ($f in Get-ChildItem -LiteralPath $dir.FullName -Filter 'ActivitiesCache.db*' -File -Force) {
            $dst = Join-Path $OutDir "$u\$($dir.Name)"
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
            if (-not (Test-Path -LiteralPath (Join-Path $dst $f.Name))) { $null = esentutl.exe /y $f.FullName /vss /d (Join-Path $dst $f.Name) 2>&1 }
            [pscustomobject]@{ User = $u; Folder = $dir.Name; File = $f.Name; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
        }
    }
}
