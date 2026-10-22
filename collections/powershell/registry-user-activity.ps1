$Name = 'Registry - User Activity'
$Description = 'User activity recorded in each NTUSER.DAT: Run dialog history (RunMRU), typed Explorer paths, typed URLs, Explorer search terms, mapped-drive history, RDP client connections and saved servers, and PuTTY and WinSCP saved sessions. Shows what a user typed and where they connected from this host. Offline user hives are loaded for the run.'
$Dependencies = @()
$Tags = @('forensics', 'registry', 'lateral-movement', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
function Mount-Hives([switch]$Classes) {
    foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
        $sid = $p.SID; $user = Split-Path $p.LocalPath -Leaf
        $key = if ($Classes) { "${sid}_Classes" } else { $sid }
        $file = if ($Classes) { Join-Path $p.LocalPath 'AppData\Local\Microsoft\Windows\UsrClass.dat' } else { Join-Path $p.LocalPath 'NTUSER.DAT' }
        $mount = $null
        if (-not (Test-Path "Registry::HKEY_USERS\$key")) {
            if (-not (Test-Path -LiteralPath $file)) { continue }
            $mount = "KB_$($key -replace '[^A-Za-z0-9]', '_')"
            $null = reg load "HKU\$mount" $file 2>&1
            if ($LASTEXITCODE -ne 0) { continue }
            $root = "Registry::HKEY_USERS\$mount"
        } else { $root = "Registry::HKEY_USERS\$key" }
        [pscustomobject]@{ User = $user; Sid = $sid; Root = $root; Mount = $mount }
    }
}
function Dismount-Hives($hives) { foreach ($h in $hives) { if (-not $h.Mount) { continue }; for ($i = 0; $i -lt 10; $i++) { [gc]::Collect(); [gc]::WaitForPendingFinalizers(); $null = reg unload "HKU\$($h.Mount)" 2>&1; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Milliseconds 300 } } }
$hives = @(Mount-Hives)
foreach ($h in $hives) {
    $r = $h.Root
    $lists = @(
        @('RunMRU', "$r\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU"),
        @('TypedPaths', "$r\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths"),
        @('TypedURLs', "$r\Software\Microsoft\Internet Explorer\TypedURLs"),
        @('MappedDriveMRU', "$r\Software\Microsoft\Windows\CurrentVersion\Explorer\Map Network Drive MRU"),
        @('RDP recent', "$r\Software\Microsoft\Terminal Server Client\Default")
    )
    foreach ($l in $lists) {
        $k = Get-Item $l[1]
        if (-not $k) { continue }
        foreach ($n in $k.GetValueNames()) { if ($n -ne 'MRUList') { [pscustomobject]@{ User = $h.User; Source = $l[0]; Name = $n; Value = [string]$k.GetValue($n) } } }
    }
    foreach ($s in Get-ChildItem "$r\Software\Microsoft\Terminal Server Client\Servers") { [pscustomobject]@{ User = $h.User; Source = 'RDP saved server'; Name = $s.PSChildName; Value = "UsernameHint=$($s.GetValue('UsernameHint'))" } }
    $ww = Get-Item "$r\Software\Microsoft\Windows\CurrentVersion\Explorer\WordWheelQuery"
    foreach ($n in $ww.GetValueNames()) { $v = $ww.GetValue($n); if ($v -is [byte[]]) { [pscustomobject]@{ User = $h.User; Source = 'Explorer search'; Name = $n; Value = [Text.Encoding]::Unicode.GetString($v).TrimEnd([char]0) } } }
    foreach ($s in Get-ChildItem "$r\Software\SimonTatham\PuTTY\Sessions") { [pscustomobject]@{ User = $h.User; Source = 'PuTTY session'; Name = $s.PSChildName; Value = "Host=$($s.GetValue('HostName')) User=$($s.GetValue('UserName')) Port=$($s.GetValue('PortNumber'))" } }
    foreach ($s in Get-ChildItem "$r\Software\Martin Prikryl\WinSCP 2\Sessions") { [pscustomobject]@{ User = $h.User; Source = 'WinSCP session'; Name = $s.PSChildName; Value = "Host=$($s.GetValue('HostName')) User=$($s.GetValue('UserName'))" } }
}
$k = $p = $clsid = $guid = $count = $ww = $s = $null
Dismount-Hives $hives
