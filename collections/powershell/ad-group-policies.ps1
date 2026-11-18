$Name = 'AD - Group Policy Objects'
$Description = 'Group Policy objects in the domain with their creation and modification times and link counts. A recently changed GPO can push software or settings to every machine.'
$Dependencies = @()
$Tags = @('active-directory', 'persistence', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$s = [adsisearcher]'(objectClass=groupPolicyContainer)'
$s.PageSize = 500; $s.PropertiesToLoad.AddRange(@('displayname', 'name', 'whencreated', 'whenchanged', 'gpcfilesyspath', 'versionnumber'))
foreach ($r in $s.FindAll()) { $p = $r.Properties; [pscustomobject]@{ Name = "$($p.displayname)"; Guid = "$($p.name)"; Created = "$($p.whencreated)"; Changed = "$($p.whenchanged)"; Version = "$($p.versionnumber)"; SysvolPath = "$($p.gpcfilesyspath)" } }
