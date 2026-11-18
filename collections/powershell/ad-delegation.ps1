$Name = 'AD - Accounts With Delegation'
$Description = 'Computers and users trusted for delegation (unconstrained or constrained). Unconstrained delegation lets a compromised host impersonate any user that connects to it.'
$Dependencies = @()
$Tags = @('active-directory', 'privilege-escalation', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
$s = [adsisearcher]'(|(userAccountControl:1.2.840.113556.1.4.803:=524288)(msDS-AllowedToDelegateTo=*))'
$s.PageSize = 500; $s.PropertiesToLoad.AddRange(@('samaccountname', 'objectclass', 'useraccountcontrol', 'msds-allowedtodelegateto', 'dnshostname'))
foreach ($r in $s.FindAll()) { $p = $r.Properties; $u = [int]"$($p.useraccountcontrol)"; [pscustomobject]@{ Name = "$($p.samaccountname)"; Class = "$($p.objectclass[$p.objectclass.Count - 1])"; Unconstrained = [bool]($u -band 524288); ConstrainedTo = (($p.'msds-allowedtodelegateto') -join '; ') } }
