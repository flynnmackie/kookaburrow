$Name = 'Accounts - Dangerous User Rights'
$Description = 'Who holds powerful rights (debug programs, act as part of the operating system, load drivers, take ownership, log on through Remote Desktop), read from the local security policy.'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
$f = Join-Path $env:TEMP ("kb-secpol-" + [guid]::NewGuid().ToString('N') + '.inf')
secedit /export /cfg $f /areas USER_RIGHTS 2>&1 | Out-Null
$want = 'SeDebugPrivilege','SeTcbPrivilege','SeLoadDriverPrivilege','SeTakeOwnershipPrivilege','SeBackupPrivilege','SeRestorePrivilege','SeImpersonatePrivilege','SeRemoteInteractiveLogonRight','SeNetworkLogonRight','SeAssignPrimaryTokenPrivilege'
foreach ($l in (Get-Content $f)) { if ($l -match '^(\w+)\s*=\s*(.*)$' -and $want -contains $Matches[1]) { foreach ($s in ($Matches[2] -split ',')) { $s = $s.Trim().TrimStart('*'); $n = try { (New-Object Security.Principal.SecurityIdentifier $s).Translate([Security.Principal.NTAccount]).Value } catch { $s }; [pscustomobject]@{ Right = $Matches[1]; Holder = $n } } } }
Remove-Item $f -Force
