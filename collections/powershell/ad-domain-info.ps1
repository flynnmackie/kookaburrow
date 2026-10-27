$Name = 'AD - Domain Info'
$Description = 'The shape of the Active Directory domain.'
$Dependencies = @()
$Tags = @('inventory', 'discovery', 'active-directory')

$ErrorActionPreference = 'Stop'
try { $d = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain() } catch { throw 'This host is not joined to a domain, or no domain controller is reachable' }
$f = $d.Forest
$levels = @{ 0 = '2000'; 1 = '2003 interim'; 2 = '2003'; 3 = '2008'; 4 = '2008 R2'; 5 = '2012'; 6 = '2012 R2'; 7 = '2016'; 10 = '2025' }
$root0 = [ADSI]"LDAP://$(([ADSI]'LDAP://RootDSE').defaultNamingContext)"
$domLevel = $levels[[int]([ADSI]'LDAP://RootDSE').domainFunctionality[0]]
$forLevel = $levels[[int]([ADSI]'LDAP://RootDSE').forestFunctionality[0]]
[pscustomobject]@{ Item = 'Domain'; Name = $d.Name; Detail = "functional level $domLevel; PDC $($d.PdcRoleOwner.Name)" }
[pscustomobject]@{ Item = 'Forest'; Name = $f.Name; Detail = "functional level $forLevel; schema master $($f.SchemaRoleOwner.Name); naming master $($f.NamingRoleOwner.Name)" }
foreach ($dc in $d.DomainControllers) { [pscustomobject]@{ Item = 'Domain controller'; Name = $dc.Name; Detail = "$($dc.IPAddress) $($dc.OSVersion) site $($dc.SiteName) roles: $($dc.Roles -join ',')" } }
foreach ($t in $d.GetAllTrustRelationships()) { [pscustomobject]@{ Item = 'Trust'; Name = $t.TargetName; Detail = "$($t.TrustType) $($t.TrustDirection)" } }
$root = [ADSI]"LDAP://$(([ADSI]'LDAP://RootDSE').defaultNamingContext)"
$ft = { param($v) if ($v -is [System.__ComObject]) { $h = $v.GetType().InvokeMember('HighPart', 'GetProperty', $null, $v, $null); $l = $v.GetType().InvokeMember('LowPart', 'GetProperty', $null, $v, $null); [math]::Abs(([int64]$h -shl 32) + [uint32]$l) / 600000000 } }
[pscustomobject]@{ Item = 'Password policy'; Name = 'domain'; Detail = "min length $($root.minPwdLength); history $($root.pwdHistoryLength); max age $([math]::Round((& $ft $root.maxPwdAge) / 1440, 0)) days; complexity flag $($root.pwdProperties); lockout threshold $($root.lockoutThreshold)" }
