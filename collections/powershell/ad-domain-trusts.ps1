$Name = 'AD - Domain Trusts'
$Description = 'Trusts between this domain and others, with direction and type. New or unexpected trusts open lateral movement paths.'
$Dependencies = @()
$Tags = @('active-directory', 'lateral-movement', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$d = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
foreach ($t in $d.GetAllTrustRelationships()) { [pscustomobject]@{ Source = $t.SourceName; Target = $t.TargetName; Direction = "$($t.TrustDirection)"; Type = "$($t.TrustType)" } }
