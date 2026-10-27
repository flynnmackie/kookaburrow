$Name = 'Recycle Bin - Collect'
$Description = 'Copies the Recycle Bin metadata files ($I) of every user and drive for parsing with RBCmd: original path, size and deletion time. Needs administrator rights.'
$Dependencies = @()
$Tags = @('forensics', 'filesystem', 'defense-evasion')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'
$Produces = @('recyclebin')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($drive in (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3').DeviceID) {
    foreach ($sidDir in Get-ChildItem -LiteralPath "$drive\`$Recycle.Bin" -Directory -Force) {
        $dst = Join-Path $OutDir (Join-Path $drive.TrimEnd(':') $sidDir.Name)
        foreach ($f in Get-ChildItem -LiteralPath $sidDir.FullName -Filter '$I*' -File -Force) {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
            [pscustomobject]@{ Drive = $drive; Sid = $sidDir.Name; File = $f.Name; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
        }
    }
}
