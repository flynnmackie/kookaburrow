$Name = 'Execution - Jump Lists'
$Description = 'Jump List files (AutomaticDestinations and CustomDestinations) for every user.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'filesystem')

$ErrorActionPreference = 'SilentlyContinue'
$known = @{ '1b4dd67f29cb1962' = 'Windows Explorer'; '5f7b5f1e01b83767' = 'Quick Access'; 'f01b4d95cf55d32a' = 'Windows Explorer'; '9b9cdc69c1c24e2b' = 'Notepad'; 'fb3b0dbfee58fac8' = 'Windows Media Player'; 'b8ab77100df80ab2' = 'Chrome'; 'a7bd71699cd38d1c' = 'Word'; 'adecfb853d77462a' = 'Word 2013'; '9d1f905ce5044aee' = 'Excel 2013'; '918e0ecb43d17e23' = 'Notepad (Win10)'; '3d1d8eb1b2a2f6e0' = 'Paint'; '83e6f80bd1c7ab5c' = 'Remote Desktop'; '12dc1ea8e34b5a6' = 'Paint'; 'c1b8d4c9d5ec5a5b' = 'Command Prompt' }
$rows = foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($sub in 'AutomaticDestinations', 'CustomDestinations') {
        Get-ChildItem -LiteralPath "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\Recent\$sub" -File -Force | ForEach-Object {
            $id = $_.BaseName
            [pscustomobject]@{ User = $u; Type = $sub; AppId = $id; Application = $known[$id.ToLower()]; SizeBytes = $_.Length; Created = $_.CreationTime; Modified = $_.LastWriteTime }
        }
    }
}
$rows | Sort-Object Modified -Descending
