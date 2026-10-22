$Name = 'Persistence - Office Startup'
$Description = 'Microsoft Office persistence: files in the Word STARTUP and Excel XLSTART folders, the global Normal.dotm template, registered add-ins and the Trusted Locations list (a path trusted for macros). Macro-enabled templates and add-ins run code every time Office starts.'
$Dependencies = @()
$Tags = @('persistence', 'execution', 'office')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    $items = @("$($p.LocalPath)\AppData\Roaming\Microsoft\Word\STARTUP", "$($p.LocalPath)\AppData\Roaming\Microsoft\Excel\XLSTART", "$($p.LocalPath)\AppData\Roaming\Microsoft\Templates", "$($p.LocalPath)\AppData\Roaming\Microsoft\AddIns")
    foreach ($d in $items) {
        Get-ChildItem -LiteralPath $d -File -Force | Where-Object { $_.Name -notlike '~$*' -and ($d -notlike '*Templates' -or $_.Name -like 'Normal*') } | ForEach-Object {
            [pscustomobject]@{ Item = 'File'; User = $u; Location = $_.FullName; Detail = "$($_.Length) bytes"; Modified = $_.LastWriteTime; Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
        }
    }
    $root = "Registry::HKEY_USERS\$($p.SID)\Software\Microsoft\Office"
    foreach ($ver in Get-ChildItem $root) {
        foreach ($app in Get-ChildItem $ver.PSPath) {
            foreach ($ad in Get-ChildItem "$($app.PSPath)\Addins") { [pscustomobject]@{ Item = 'Add-in'; User = $u; Location = "$($ver.PSChildName)\$($app.PSChildName)\$($ad.PSChildName)"; Detail = "Manifest=$($ad.GetValue('Manifest')) LoadBehavior=$($ad.GetValue('LoadBehavior'))"; Modified = ''; Sha256 = '' } }
            foreach ($tl in Get-ChildItem "$($app.PSPath)\Security\Trusted Locations") { [pscustomobject]@{ Item = 'Trusted location'; User = $u; Location = $tl.GetValue('Path'); Detail = "AllowSubfolders=$($tl.GetValue('AllowSubfolders'))"; Modified = ''; Sha256 = '' } }
        }
    }
}
