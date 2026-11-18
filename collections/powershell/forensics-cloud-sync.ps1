$Name = 'Forensics - Cloud Sync Clients and Accounts'
$Description = 'OneDrive, Dropbox, Google Drive and Box sync clients and the accounts and folders they sync. A data theft route that bypasses network monitoring.'
$Dependencies = @()
$Tags = @('forensics', 'inventory', 'exfiltration')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $a = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\OneDrive\Accounts"; foreach ($x in (Get-ChildItem $a)) { $p = Get-ItemProperty $x.PSPath; [pscustomobject]@{ Sid = $root.PSChildName; Client = 'OneDrive'; Account = $p.UserEmail; Folder = $p.UserFolder } } }
foreach ($d in 'Dropbox', 'Google\Drive', 'Box', 'MEGAsync') { foreach ($b in $env:LOCALAPPDATA, $env:APPDATA, $env:ProgramFiles) { if (Test-Path (Join-Path $b $d)) { [pscustomobject]@{ Sid = ''; Client = $d; Account = ''; Folder = (Join-Path $b $d) } } } }
