$Name = 'Forensics - Software Installed Per User'
$Description = 'Programs installed for individual users (outside Program Files), read from every logged-on user uninstall key and the user app folders. Per-user installs bypass admin controls.'
$Dependencies = @()
$Tags = @('inventory', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { Get-ChildItem "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Windows\CurrentVersion\Uninstall" | ForEach-Object { $p = Get-ItemProperty $_.PSPath; if ($p.DisplayName) { [pscustomobject]@{ Sid = $root.PSChildName; Name = $p.DisplayName; Version = $p.DisplayVersion; Publisher = $p.Publisher; Location = $p.InstallLocation; InstallDate = $p.InstallDate } } } }
