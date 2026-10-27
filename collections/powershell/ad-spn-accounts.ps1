$Name = 'AD - Kerberoastable Accounts'
$Description = 'User accounts that have a service principal name (SPN) set, which makes them targets for Kerberoasting (any user can request their service ticket and crack the password offline).'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation', 'lateral-movement', 'active-directory')

$ErrorActionPreference = 'Stop'
try { $dn = ([ADSI]'LDAP://RootDSE').defaultNamingContext.ToString() } catch { throw 'This host is not joined to a domain, or no domain controller is reachable' }
try { $null = ([adsisearcher]'(objectClass=domain)').FindOne() } catch { throw 'Active Directory cannot be queried from this session. A remote session on a member server cannot pass your credentials on to a domain controller (the WinRM double-hop limit), so run this hunt against a domain controller.' }
$s = [adsisearcher]'(&(objectCategory=person)(objectClass=user)(servicePrincipalName=*)(!(samAccountName=krbtgt)))'
$s.SearchRoot = [ADSI]"LDAP://$dn"; $s.PageSize = 1000
foreach ($p in 'samaccountname', 'serviceprincipalname', 'useraccountcontrol', 'pwdlastset', 'admincount', 'description', 'lastlogontimestamp') { [void]$s.PropertiesToLoad.Add($p) }
foreach ($r in $s.FindAll()) {
    $uac = [int]$r.Properties['useraccountcontrol'][0]
    $pw = [int64]$r.Properties['pwdlastset'][0]
    [pscustomobject]@{ Account = $r.Properties['samaccountname'][0]; Enabled = -not ($uac -band 2); PasswordLastSet = $(if ($pw -gt 0) { [datetime]::FromFileTime($pw).ToString('yyyy-MM-dd') } else { '' }); PasswordAgeDays = $(if ($pw -gt 0) { [int]((Get-Date) - [datetime]::FromFileTime($pw)).TotalDays } else { '' }); AdminCount = $r.Properties['admincount'][0]; Spns = ($r.Properties['serviceprincipalname'] -join '; '); Description = $r.Properties['description'][0] }
}
