$Name = 'IIS - Sites, Bindings and Application Pools'
$Description = 'IIS web sites with their bindings, folders and application pool identities. Shows what the host publishes and under which account.'
$Dependencies = @()
$Tags = @('inventory', 'network', 'web')

$ErrorActionPreference = 'SilentlyContinue'
Import-Module WebAdministration
Get-Website | ForEach-Object { $s = $_; foreach ($b in $s.Bindings.Collection) { [pscustomobject]@{ Site = $s.Name; State = $s.State; Binding = "$($b.protocol) $($b.bindingInformation)"; Folder = $s.PhysicalPath; AppPool = $s.ApplicationPool; PoolIdentity = (Get-ItemProperty "IIS:\AppPools\$($s.ApplicationPool)").processModel.identityType } } }
