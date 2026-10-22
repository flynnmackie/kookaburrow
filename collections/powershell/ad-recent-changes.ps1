$Name = 'AD - Recent Objects'
$Description = 'Users, computers or groups created or changed in Active Directory in the last N days: name, when it was created and last changed, enabled state and its distinguished name. ObjectType is user (default), computer or group; Days defaults to 7. A new account or a changed group shortly before an incident is a standard persistence sign. Run it against a domain controller (uses built-in ADSI, no modules needed; from a member server the WinRM double-hop limit blocks the query).'
$Dependencies = @()
$Parameters = @('ObjectType?', 'Days?')
$Tags = @('accounts', 'persistence', 'forensics', 'active-directory')

$ErrorActionPreference = 'Stop'
try { $dn = ([ADSI]'LDAP://RootDSE').defaultNamingContext.ToString() } catch { throw 'This host is not joined to a domain, or no domain controller is reachable' }
try { $null = ([adsisearcher]'(objectClass=domain)').FindOne() } catch { throw 'Active Directory cannot be queried from this session. A remote session on a member server cannot pass your credentials on to a domain controller (the WinRM double-hop limit), so run this hunt against a domain controller.' }
$days = if ($Days -match '^\d+$') { [int]$Days } else { 7 }
$cat = switch ($(if ($ObjectType) { $ObjectType.ToLower() } else { 'user' })) { 'user' { '(&(objectCategory=person)(objectClass=user))' } 'computer' { '(objectCategory=computer)' } 'group' { '(objectCategory=group)' } default { throw 'ObjectType must be user, computer or group' } }
$since = (Get-Date).ToUniversalTime().AddDays(-$days).ToString('yyyyMMddHHmmss.0Z')
$s = [adsisearcher]"(&$cat(|(whenChanged>=$since)(whenCreated>=$since)))"
$s.SearchRoot = [ADSI]"LDAP://$dn"; $s.PageSize = 1000
foreach ($p in 'samaccountname', 'whencreated', 'whenchanged', 'useraccountcontrol', 'distinguishedname', 'description', 'memberof') { [void]$s.PropertiesToLoad.Add($p) }
foreach ($r in $s.FindAll() | Sort-Object { $_.Properties['whenchanged'][0] } -Descending) {
    $uac = if ($r.Properties['useraccountcontrol'].Count) { [int]$r.Properties['useraccountcontrol'][0] } else { 0 }
    [pscustomobject]@{ Name = $r.Properties['samaccountname'][0]; Created = ([datetime]$r.Properties['whencreated'][0]).ToString('yyyy-MM-dd HH:mm'); Changed = ([datetime]$r.Properties['whenchanged'][0]).ToString('yyyy-MM-dd HH:mm'); Enabled = -not ($uac -band 2); Groups = @($r.Properties['memberof']).Count; Dn = $r.Properties['distinguishedname'][0]; Description = $r.Properties['description'][0] }
}
