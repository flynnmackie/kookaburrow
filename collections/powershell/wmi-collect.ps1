$Name = 'WMI - Collect Repository'
$Description = 'Copies the WMI repository (OBJECTS.DATA, INDEX.BTR and the mapping files from C:\Windows\System32\wbem\Repository). Permanent event subscriptions, which attackers use for fileless persistence, live in OBJECTS.DATA and can be extracted offline with PyWMIPersistenceFinder or strings. The files are copied from a volume shadow. Needs administrator rights. Comes back over SMB, which is switched on for this collection only.'
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
