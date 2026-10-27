$Name = 'AD - Account Weaknesses'
$Description = 'Enabled accounts with risky settings.'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation', 'persistence', 'active-directory')

$ErrorActionPreference = 'Stop'
try { $dn = ([ADSI]'LDAP://RootDSE').defaultNamingContext.ToString() } catch { throw 'This host is not joined to a domain, or no domain controller is reachable' }
try { $null = ([adsisearcher]'(objectClass=domain)').FindOne() } catch { throw 'Active Directory cannot be queried from this session. A remote session on a member server cannot pass your credentials on to a domain controller (the WinRM double-hop limit), so run this hunt against a domain controller.' }
$checks = @(
    @('Password never expires', 0x10000), @('Password not required', 0x20), @('Pre-authentication not required (AS-REP roastable)', 0x400000),
    @('Reversible password encryption', 0x80), @('Unconstrained delegation', 0x80000), @('Trusted to authenticate for delegation', 0x1000000), @('Kerberos DES only', 0x200000)
)
foreach ($c in $checks) {
    $s = [adsisearcher]"(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(userAccountControl:1.2.840.113556.1.4.803:=$($c[1])))"
    $s.SearchRoot = [ADSI]"LDAP://$dn"; $s.PageSize = 1000
    foreach ($p in 'samaccountname', 'pwdlastset', 'admincount', 'lastlogontimestamp', 'description') { [void]$s.PropertiesToLoad.Add($p) }
    foreach ($r in $s.FindAll()) {
        $pw = [int64]$r.Properties['pwdlastset'][0]; $ll = [int64]$r.Properties['lastlogontimestamp'][0]
        [pscustomobject]@{ Weakness = $c[0]; Account = $r.Properties['samaccountname'][0]; AdminCount = $r.Properties['admincount'][0]; PasswordLastSet = $(if ($pw -gt 0) { [datetime]::FromFileTime($pw).ToString('yyyy-MM-dd') } else { '' }); LastLogon = $(if ($ll -gt 0) { [datetime]::FromFileTime($ll).ToString('yyyy-MM-dd') } else { '' }); Description = $r.Properties['description'][0] }
    }
}
$s = [adsisearcher]'(&(objectCategory=computer)(userAccountControl:1.2.840.113556.1.4.803:=524288)(!(primaryGroupID=516)))'
$s.SearchRoot = [ADSI]"LDAP://$dn"
foreach ($r in $s.FindAll()) { [pscustomobject]@{ Weakness = 'Computer with unconstrained delegation (not a domain controller)'; Account = $r.Properties['name'][0]; AdminCount = ''; PasswordLastSet = ''; LastLogon = ''; Description = '' } }
