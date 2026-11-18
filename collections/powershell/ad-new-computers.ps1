$Name = 'AD - Recently Created Computer Accounts'
$Description = 'Computer accounts created in the last days (default 14). Rogue machine accounts are used for relay and delegation attacks.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('active-directory', 'persistence', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$d = if ($Days) { [int]$Days } else { 14 }
$t = (Get-Date).AddDays(-$d).ToUniversalTime().ToString('yyyyMMddHHmmss.0Z')
$s = [adsisearcher]"(&(objectCategory=computer)(whenCreated>=$t))"
$s.PageSize = 500; $s.PropertiesToLoad.AddRange(@('name', 'dnshostname', 'operatingsystem', 'whencreated', 'ms-ds-creatorsid'))
foreach ($r in $s.FindAll()) { $p = $r.Properties; $c = if ($p.'ms-ds-creatorsid') { try { (New-Object Security.Principal.SecurityIdentifier ([byte[]]$p.'ms-ds-creatorsid'[0], 0)).Translate([Security.Principal.NTAccount]).Value } catch { '' } } else { '' }; [pscustomobject]@{ Name = "$($p.name)"; OS = "$($p.operatingsystem)"; Created = "$($p.whencreated)"; CreatedBy = $c } }
