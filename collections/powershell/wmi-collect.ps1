$Name = 'WMI - Collect Repository'
$Description = 'Copies the WMI repository (OBJECTS.DATA, INDEX.BTR and the mapping files from C:\Windows\System32\wbem\Repository). Needs administrator rights.'
$Dependencies = @()
$Tags = @('wmi', 'persistence', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$root = "$env:SystemRoot\System32\wbem\Repository"
foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $dst = Join-Path $OutDir "Repository\$rel"
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    try { Copy-Item -LiteralPath $f.FullName -Destination $dst -Force -ErrorAction Stop } catch { $null = esentutl.exe /y $f.FullName /vss /d $dst 2>&1 }
    [pscustomobject]@{ File = $rel; SizeBytes = $f.Length; Modified = $f.LastWriteTime; Copied = (Test-Path -LiteralPath $dst) }
}
