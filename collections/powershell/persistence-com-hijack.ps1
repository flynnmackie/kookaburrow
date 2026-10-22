$Name = 'Persistence - COM Hijacks'
$Description = 'Per-user COM class registrations (HKCU Software\Classes\CLSID) that point at a DLL or EXE. A user-level InprocServer32 or LocalServer32 overrides the machine one without admin rights, so it is a favourite stealth persistence method. Any entry here is worth checking; legitimate ones are rare. Offline user hives are loaded for the run (like Windows.Persistence.* COM artifacts).'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'registry')

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
$hives = @(Mount-Hives -Classes)
foreach ($h in $hives) {
    foreach ($clsid in Get-ChildItem "$($h.Root)\CLSID") {
        foreach ($srv in 'InprocServer32', 'LocalServer32', 'InprocHandler32') {
            $k = Get-Item "$($clsid.PSPath)\$srv"
            if (-not $k) { continue }
            $target = [string]$k.GetValue('')
            $exists = $false; $sha = ''
            $clean = ($target -replace '^"', '' -replace '".*$', '') -replace '\s+/.*$', ''
            if ($clean -and (Test-Path -LiteralPath ([Environment]::ExpandEnvironmentVariables($clean)))) { $exists = $true; $sha = (Get-FileHash -LiteralPath ([Environment]::ExpandEnvironmentVariables($clean)) -Algorithm SHA256).Hash }
            [pscustomobject]@{ User = $h.User; Clsid = $clsid.PSChildName; Server = $srv; Target = $target; TargetExists = $exists; Sha256 = $sha; ThreadingModel = $k.GetValue('ThreadingModel') }
        }
    }
}
$k = $p = $clsid = $guid = $count = $ww = $s = $null
Dismount-Hives $hives
