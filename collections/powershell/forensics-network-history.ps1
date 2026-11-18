$Name = 'Forensics - Known Networks'
$Description = 'Networks this host connected to (profile name, description, type, first and last connection). Shows where a laptop has been.'
$Dependencies = @()
$Tags = @('forensics', 'network', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$sig = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList'
Get-ChildItem "$sig\Profiles" | ForEach-Object { $p = Get-ItemProperty $_.PSPath
 $first = if ($p.DateCreated) { try { [datetime]::new((($p.DateCreated[0]) + ($p.DateCreated[1] * 256)), $p.DateCreated[2], $p.DateCreated[6], $p.DateCreated[8], $p.DateCreated[10], $p.DateCreated[12]) } catch { '' } } else { '' }
 $last = if ($p.DateLastConnected) { try { [datetime]::new((($p.DateLastConnected[0]) + ($p.DateLastConnected[1] * 256)), $p.DateLastConnected[2], $p.DateLastConnected[6], $p.DateLastConnected[8], $p.DateLastConnected[10], $p.DateLastConnected[12]) } catch { '' } } else { '' }
 [pscustomobject]@{ Profile = $p.ProfileName; Description = $p.Description; Managed = $p.Managed; Category = $p.Category; FirstConnected = $first; LastConnected = $last } }
