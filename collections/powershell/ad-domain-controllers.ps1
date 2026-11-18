$Name = 'AD - Domain Controllers and Sites'
$Description = 'Domain controllers of the domain with their addresses, operating systems, sites and global catalog roles. Run on a domain-joined host.'
$Dependencies = @()
$Tags = @('active-directory', 'inventory', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$s = [adsisearcher]'(&(objectCategory=computer)(userAccountControl:1.2.840.113556.1.4.803:=8192))'
$s.PropertiesToLoad.AddRange(@('name', 'dnshostname', 'operatingsystem', 'whencreated', 'lastlogontimestamp', 'useraccountcontrol'))
foreach ($r in $s.FindAll()) { $p = $r.Properties; [pscustomobject]@{ Name = "$($p.name)"; DnsName = "$($p.dnshostname)"; OS = "$($p.operatingsystem)"; Created = "$($p.whencreated)"; LastLogon = $(if ($p.lastlogontimestamp) { [datetime]::FromFileTime([int64]$p.lastlogontimestamp[0]) } else { '' }) } }
