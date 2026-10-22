$Name = 'Execution - UserAssist'
$Description = 'Programs launched from Explorer by each user, decoded from the UserAssist registry keys (ROT13 names): run count, focus count and time, and last execution time. Evidence that a user started a program, even if it was later deleted (like Windows.Registry.UserAssist). Offline user hives are loaded for the run.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry')

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
function Rot13([string]$s) { -join ($s.ToCharArray() | ForEach-Object { $c = [int]$_; if ($c -ge 65 -and $c -le 90) { [char]((($c - 65 + 13) % 26) + 65) } elseif ($c -ge 97 -and $c -le 122) { [char]((($c - 97 + 13) % 26) + 97) } else { $_ } }) }
$hives = @(Mount-Hives)
foreach ($h in $hives) {
    foreach ($guid in Get-ChildItem "$($h.Root)\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist") {
        $count = Get-Item "$($guid.PSPath)\Count"
        foreach ($n in $count.GetValueNames()) {
            $b = $count.GetValue($n)
            if ($b -isnot [byte[]] -or $b.Length -lt 68) { continue }
            $ft = [BitConverter]::ToInt64($b, 60)
            [pscustomobject]@{ User = $h.User; Program = (Rot13 $n); RunCount = [BitConverter]::ToUInt32($b, 4); FocusCount = [BitConverter]::ToUInt32($b, 8); FocusSeconds = [math]::Round([BitConverter]::ToUInt32($b, 12) / 1000); LastRun = if ($ft -gt 0) { [DateTime]::FromFileTimeUtc($ft) } else { '' } }
        }
    }
}
$k = $p = $clsid = $guid = $count = $ww = $s = $null
Dismount-Hives $hives
