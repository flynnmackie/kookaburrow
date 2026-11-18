$Name = 'AD - Accounts Protected by AdminSDHolder'
$Description = 'Users and groups with adminCount = 1: current or former members of privileged groups. Old accounts that kept the flag keep hidden rights.'
$Dependencies = @()
$Tags = @('active-directory', 'accounts', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
$s = [adsisearcher]'(&(adminCount=1)(|(objectClass=user)(objectClass=group)))'
$s.PageSize = 500; $s.PropertiesToLoad.AddRange(@('samaccountname', 'objectclass', 'whencreated', 'pwdlastset', 'useraccountcontrol', 'memberof'))
foreach ($r in $s.FindAll()) { $p = $r.Properties; [pscustomobject]@{ Name = "$($p.samaccountname)"; Class = "$($p.objectclass[$p.objectclass.Count - 1])"; Created = "$($p.whencreated)"; PasswordLastSet = $(if ($p.pwdlastset -and [int64]$p.pwdlastset[0] -gt 0) { [datetime]::FromFileTime([int64]$p.pwdlastset[0]) } else { '' }); Disabled = [bool]([int]"$($p.useraccountcontrol)" -band 2) } }
