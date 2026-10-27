$Name = 'AD - Privileged Groups'
$Description = 'Members of the most powerful Active Directory groups.'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation', 'persistence', 'active-directory')

$ErrorActionPreference = 'Stop'
try { $dn = ([ADSI]'LDAP://RootDSE').defaultNamingContext.ToString() } catch { throw 'This host is not joined to a domain, or no domain controller is reachable' }
try { $null = ([adsisearcher]'(objectClass=domain)').FindOne() } catch { throw 'Active Directory cannot be queried from this session. A remote session on a member server cannot pass your credentials on to a domain controller (the WinRM double-hop limit), so run this hunt against a domain controller.' }
function Find($filter, $props) { $s = [adsisearcher]$filter; $s.SearchRoot = [ADSI]"LDAP://$dn"; $s.PageSize = 1000; foreach ($p in $props) { [void]$s.PropertiesToLoad.Add($p) }; $s.FindAll() }
$ft = { param($v) if ($v -and [int64]$v -gt 0 -and [int64]$v -lt [int64]::MaxValue) { [datetime]::FromFileTime([int64]$v).ToString('yyyy-MM-dd HH:mm') } else { '' } }
foreach ($g in 'Domain Admins', 'Enterprise Admins', 'Schema Admins', 'Administrators', 'Account Operators', 'Backup Operators', 'Server Operators', 'Print Operators', 'DnsAdmins', 'Group Policy Creator Owners') {
    $grp = Find "(&(objectCategory=group)(cn=$g))" @('distinguishedName') | Select-Object -First 1
    if (-not $grp) { continue }
    $gdn = $grp.Properties['distinguishedname'][0]
    foreach ($m in Find "(memberOf:1.2.840.113556.1.4.1941:=$gdn)" @('samaccountname', 'objectclass', 'useraccountcontrol', 'lastlogontimestamp', 'pwdlastset', 'description')) {
        $uac = if ($m.Properties['useraccountcontrol'].Count) { [int]$m.Properties['useraccountcontrol'][0] } else { 0 }
        [pscustomobject]@{ Group = $g; Member = $m.Properties['samaccountname'][0]; Type = $m.Properties['objectclass'][$m.Properties['objectclass'].Count - 1]; Enabled = -not ($uac -band 2); PasswordNeverExpires = [bool]($uac -band 0x10000); LastLogon = (& $ft $m.Properties['lastlogontimestamp'][0]); PasswordLastSet = (& $ft $m.Properties['pwdlastset'][0]); Description = $m.Properties['description'][0] }
    }
}
