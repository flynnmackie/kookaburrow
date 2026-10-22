$Name = 'Browser - Collect History'
$Description = 'Copies browser history data for every user: Chrome, Edge and Brave (History, Bookmarks, Preferences) and Firefox (places.sqlite, formhistory.sqlite, extensions.json) for analysis with Hindsight, BrowsingHistoryView or SQLite. Passwords, cookies and saved logins are NOT collected. Locked files are copied from a volume shadow. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Tags = @('forensics', 'history', 'c2')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
function Copy-File($src, $dst) {
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; return $true } catch { }
    $null = esentutl.exe /y $src /vss /d $dst 2>&1
    return (Test-Path -LiteralPath $dst)
}
$chromium = @{ Chrome = 'AppData\Local\Google\Chrome\User Data'; Edge = 'AppData\Local\Microsoft\Edge\User Data'; Brave = 'AppData\Local\BraveSoftware\Brave-Browser\User Data' }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($b in $chromium.Keys) {
        foreach ($prof in Get-ChildItem -LiteralPath (Join-Path $p.LocalPath $chromium[$b]) -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) {
            foreach ($n in 'History', 'Bookmarks', 'Preferences') {
                $src = Join-Path $prof.FullName $n
                if (Test-Path -LiteralPath $src) { $ok = Copy-File $src (Join-Path $OutDir "$u\$b\$($prof.Name)\$n"); [pscustomobject]@{ User = $u; Browser = $b; Profile = $prof.Name; File = $n; SizeBytes = (Get-Item -LiteralPath $src).Length; Copied = $ok } }
            }
        }
    }
    foreach ($fp in Get-ChildItem -LiteralPath "$($p.LocalPath)\AppData\Roaming\Mozilla\Firefox\Profiles" -Directory) {
        foreach ($n in 'places.sqlite', 'places.sqlite-wal', 'formhistory.sqlite', 'extensions.json') {
            $src = Join-Path $fp.FullName $n
            if (Test-Path -LiteralPath $src) { $ok = Copy-File $src (Join-Path $OutDir "$u\Firefox\$($fp.Name)\$n"); [pscustomobject]@{ User = $u; Browser = 'Firefox'; Profile = $fp.Name; File = $n; SizeBytes = (Get-Item -LiteralPath $src).Length; Copied = $ok } }
        }
    }
}
