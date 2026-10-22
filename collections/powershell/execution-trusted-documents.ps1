$Name = 'Execution - Trusted Documents'
$Description = 'Office documents where a user clicked Enable Content or Enable Editing (the TrustRecords registry), per user and Office application, with the full path and the time it was trusted. Macro malware needs that click, so this lists the documents that were allowed to run macros and exactly when. Offline user hives are loaded for the run.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry', 'office', 'malware')

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
    foreach ($ver in Get-ChildItem "$($h.Root)\Software\Microsoft\Office") {
        foreach ($app in Get-ChildItem $ver.PSPath) {
            $tr = Get-Item "$($app.PSPath)\Security\Trusted Documents\TrustRecords"
            foreach ($n in $tr.GetValueNames()) {
                $b = $tr.GetValue($n)
                if ($b -isnot [byte[]] -or $b.Length -lt 8) { continue }
                $ft = [BitConverter]::ToInt64($b, 0)
                $enabled = if ($b.Length -ge 24) { ([BitConverter]::ToUInt32($b, $b.Length - 4) -band 0x7FFFFFFF) -ne 0 } else { '' }
                [pscustomobject]@{ User = $h.User; Application = $app.PSChildName; Document = $n; TrustedTime = $(if ($ft -gt 0) { [DateTime]::FromFileTime($ft).ToString('yyyy-MM-dd HH:mm') } else { '' }); EnableContent = $enabled }
            }
        }
    }
}
$k = $tr = $null
Dismount-Hives $hives
