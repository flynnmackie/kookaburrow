$Name = 'Persistence - Logon and Group Policy Scripts'
$Description = 'Per-user logon scripts (UserInitMprLogonScript) and the startup, shutdown and logon scripts delivered by Group Policy.'
$Dependencies = @()
$Tags = @('persistence', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $e = (Get-ItemProperty "Registry::HKEY_USERS\$($root.PSChildName)\Environment").UserInitMprLogonScript; if ($e) { [pscustomobject]@{ Source = "UserInitMprLogonScript $($root.PSChildName)"; Path = $e } } }
foreach ($d in "$env:SystemRoot\System32\GroupPolicy\Machine\Scripts", "$env:SystemRoot\System32\GroupPolicy\User\Scripts", "$env:SystemRoot\SYSVOL") { if (Test-Path $d) { Get-ChildItem $d -Recurse -File | Where-Object { $_.Extension -match '\.(ps1|bat|cmd|vbs|js|exe)$' } | ForEach-Object { [pscustomobject]@{ Source = 'GPO script'; Path = $_.FullName } } } }
