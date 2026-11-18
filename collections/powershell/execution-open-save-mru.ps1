$Name = 'Execution - Open and Save Dialog History'
$Description = 'Files recently opened or saved through the common dialogs, grouped by extension, for every logged-on user. Shows files the user touched, even on removable media.'
$Dependencies = @()
$Tags = @('forensics', 'execution', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $k = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU"
 foreach ($e in (Get-ChildItem $k)) { $p = Get-ItemProperty $e.PSPath; foreach ($n in ($p.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' })) { $txt = [Text.Encoding]::Unicode.GetString($n.Value) -replace '[^\x20-\x7E]', ' ' -replace '\s{2,}', ' '; [pscustomobject]@{ Sid = $root.PSChildName; Extension = $e.PSChildName; Entry = $txt.Trim() } } } }
