$Name = 'Execution - Amcache'
$Description = 'Programs recorded in the Amcache hive (InventoryApplicationFile): full path, SHA-1, publisher, product, version, size and compile (link) date. Shows executables that were present or run, with hashes you can look up. The hive is copied with its transaction logs from a volume shadow if it is locked, then loaded for the run (like Windows.Forensics.Amcache). Needs administrator rights. Optional PathContains keeps only paths containing that text.'
$Dependencies = @()
$Parameters = @('PathContains?')
$Tags = @('execution', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$src = "$env:SystemRoot\AppCompat\Programs\Amcache.hve"
$mount = 'KB_AMCACHE'
$tmp = $null
$null = reg load "HKLM\$mount" $src 2>&1
if ($LASTEXITCODE -ne 0) {
    # locked: copy the hive and its transaction logs from a volume shadow so Windows can replay them when loading
    $tmp = Join-Path $env:TEMP "kb-amcache-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    foreach ($ext in '', '.LOG1', '.LOG2') { $null = esentutl.exe /y "$src$ext" /vss /d "$tmp\Amcache.hve$ext" 2>&1 }
    $null = reg load "HKLM\$mount" "$tmp\Amcache.hve" 2>&1
    if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $tmp -Recurse -Force; throw 'Amcache.hve could not be loaded (it is locked and a shadow copy could not be used). Run as an administrator.' }
}
try {
    foreach ($k in Get-ChildItem "HKLM:\$mount\Root\InventoryApplicationFile") {
        $p = Get-ItemProperty $k.PSPath
        if ($PathContains -and "$($p.LowerCaseLongPath)" -notlike "*$PathContains*") { continue }
        [pscustomobject]@{ Path = $p.LowerCaseLongPath; Name = $p.Name; Publisher = $p.Publisher; Product = $p.ProductName; Version = $p.Version; Sha1 = ($p.FileId -replace '^0000', ''); LinkDate = $p.LinkDate; SizeBytes = $p.Size; IsOsComponent = $p.IsOsComponent; ProgramId = $p.ProgramId }
    }
} finally {
    $k = $p = $null # registry handles held by these variables would keep the hive busy
    for ($i = 0; $i -lt 10; $i++) { [gc]::Collect(); [gc]::WaitForPendingFinalizers(); $null = reg unload "HKLM\$mount" 2>&1; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Milliseconds 300 }
    if ($tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
}
