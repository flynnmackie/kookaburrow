$Name = 'Registry - Collect Hives'
$Description = 'Copies the registry hives for offline analysis with RegRipper, Registry Explorer or RECmd. Needs administrator rights.'
$Dependencies = @()
$Parameters = @('Users?')
$Tags = @('registry', 'forensics', 'persistence')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'
$Produces = @('registry')

$ErrorActionPreference = 'SilentlyContinue'
function Copy-File($src, $dst) {
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; return $true } catch { }
    $null = esentutl.exe /y $src /vss /d $dst 2>&1
    return (Test-Path -LiteralPath $dst)
}
$reg = Join-Path $OutDir 'Registry'
New-Item -ItemType Directory -Path $reg -Force | Out-Null
foreach ($h in 'SYSTEM', 'SOFTWARE', 'SAM', 'SECURITY') {
    $dst = Join-Path $reg $h
    $null = reg save "HKLM\$h" $dst /y 2>&1
    $how = 'reg save'
    if (-not (Test-Path -LiteralPath $dst)) { $how = 'volume shadow copy'; $null = esentutl.exe /y "$env:SystemRoot\System32\config\$h" /vss /d $dst 2>&1 }
    [pscustomobject]@{ Hive = $h; Source = "HKLM\$h ($how)"; Collected = (Test-Path -LiteralPath $dst); SizeBytes = (Get-Item -LiteralPath $dst).Length }
}
foreach ($ext in '', '.LOG1', '.LOG2') {
    $src = "$env:SystemRoot\AppCompat\Programs\Amcache.hve$ext"; $dst = Join-Path $reg "Amcache.hve$ext"
    if (Test-Path -LiteralPath $src) { $ok = Copy-File $src $dst; [pscustomobject]@{ Hive = "Amcache.hve$ext"; Source = $src; Collected = $ok; SizeBytes = (Get-Item -LiteralPath $dst).Length } }
}
if ($Users -notmatch '^(n|no|false|0)$') {
    foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
        $u = Split-Path $p.LocalPath -Leaf
        foreach ($rel in 'NTUSER.DAT', 'AppData\Local\Microsoft\Windows\UsrClass.dat') {
            foreach ($ext in '', '.LOG1', '.LOG2') {
                $src = Join-Path $p.LocalPath "$rel$ext"
                if (-not (Test-Path -LiteralPath $src -Force)) { continue }
                $dst = Join-Path $reg "Users\$u\$(Split-Path "$rel$ext" -Leaf)"
                $ok = Copy-File $src $dst
                [pscustomobject]@{ Hive = "$u $(Split-Path "$rel$ext" -Leaf)"; Source = $src; Collected = $ok; SizeBytes = (Get-Item -LiteralPath $dst -Force).Length }
            }
        }
    }
}
