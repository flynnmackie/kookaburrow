$Name = 'Accounts - User Profiles'
$Description = 'Every user profile on the host: account, profile path, when it was last used and whether it is loaded. Shows accounts that logged on once and were forgotten.'
$Dependencies = @()
$Tags = @('accounts', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special } | ForEach-Object { $n = try { (New-Object Security.Principal.SecurityIdentifier $_.SID).Translate([Security.Principal.NTAccount]).Value } catch { $_.SID }
 [pscustomobject]@{ Account = $n; Sid = $_.SID; Path = $_.LocalPath; LastUsed = $_.LastUseTime; Loaded = $_.Loaded } }
