$Name = 'Forensics - Office Recent Documents'
$Description = 'Recently opened files recorded by Word, Excel, PowerPoint and Access for every logged-on user, with their places.'
$Dependencies = @()
$Tags = @('forensics', 'execution', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $o = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Office"
 foreach ($ver in (Get-ChildItem $o)) { foreach ($app in 'Word', 'Excel', 'PowerPoint', 'Access') { $m = "$($ver.PSPath)\$app\File MRU"; if (Test-Path $m) { $p = Get-ItemProperty $m; foreach ($n in ($p.PSObject.Properties | Where-Object { $_.Name -like 'Item *' })) { [pscustomobject]@{ Sid = $root.PSChildName; Application = $app; Version = $ver.PSChildName; Entry = ($n.Value -replace '^\[F[0-9A-F]+\]\[T[0-9A-F]+\]\[O[0-9A-F]+\]\*', '') } } } } } }
