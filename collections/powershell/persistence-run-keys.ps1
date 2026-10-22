$Name = 'Persistence - Run Keys'
$Description = 'Everything that starts from a Run, RunOnce, RunServices or Policies\Explorer\Run key, for the machine (64-bit and 32-bit) and every user profile (loading offline NTUSER.DAT files for the duration of the run). The classic persistence locations, listed with the value and what it points at.'
$Dependencies = @()
$Tags = @('persistence', 'registry', 'autoruns')

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

$rel = @('SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce', 'SOFTWARE\Microsoft\Windows\CurrentVersion\RunServices', 'SOFTWARE\Microsoft\Windows\CurrentVersion\RunServicesOnce', 'SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run', 'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows')
$targets = @()
foreach ($r in $rel) { $targets += @{ Scope = 'Machine'; Path = "HKLM:\$r" }; $targets += @{ Scope = 'Machine (32-bit)'; Path = "HKLM:\$($r -replace '^SOFTWARE', 'SOFTWARE\WOW6432Node')" } }
$hives = @(Mount-Hives)
foreach ($h in $hives) { foreach ($r in $rel) { $targets += @{ Scope = "User $($h.User)"; Path = "$($h.Root)\$r" } } }
foreach ($t in $targets) {
    $k = Get-Item $t.Path
    if (-not $k) { continue }
    foreach ($n in $k.GetValueNames()) {
        if ($t.Path -like '*NT\CurrentVersion\Windows' -and $n -notin 'Load', 'Run') { continue }
        [pscustomobject]@{ Scope = $t.Scope; Key = ($t.Path -replace '^.*\\SOFTWARE\\', ''); Name = $n; Value = [string]$k.GetValue($n); KeyModified = '' }
    }
}
$k = $p = $clsid = $guid = $count = $ww = $s = $null
Dismount-Hives $hives
