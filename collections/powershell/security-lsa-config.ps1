$Name = 'Security - LSA Authentication Packages'
$Description = 'Packages loaded by the Local Security Authority: authentication, security and notification packages and LSASS protection. Extra DLLs here steal credentials at logon.'
$Dependencies = @()
$Tags = @('persistence', 'security', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$l = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa'
foreach ($n in 'Authentication Packages', 'Security Packages', 'Notification Packages') { foreach ($v in $l.$n) { if ($v) { [pscustomobject]@{ Setting = $n; Value = $v } } } }
[pscustomobject]@{ Setting = 'RunAsPPL'; Value = $l.RunAsPPL }
[pscustomobject]@{ Setting = 'LmCompatibilityLevel'; Value = $l.LmCompatibilityLevel }
[pscustomobject]@{ Setting = 'RestrictAnonymous'; Value = $l.RestrictAnonymous }
[pscustomobject]@{ Setting = 'WDigest UseLogonCredential'; Value = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest').UseLogonCredential }
