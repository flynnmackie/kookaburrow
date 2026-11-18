$Name = 'WinRM - Configuration and Listeners'
$Description = 'WinRM listeners, authentication methods and trusted hosts. Extra listeners and weak authentication settings enable remote execution.'
$Dependencies = @()
$Tags = @('lateral-movement', 'security', 'network')

$ErrorActionPreference = 'SilentlyContinue'
Get-ChildItem WSMan:\localhost\Listener | ForEach-Object { $d = Get-ChildItem $_.PSPath; [pscustomobject]@{ Kind = 'Listener'; Name = $_.Name; Value = (($d | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; ') } }
foreach ($a in 'Basic', 'Kerberos', 'Negotiate', 'Certificate', 'CredSSP') { [pscustomobject]@{ Kind = 'Auth'; Name = $a; Value = (Get-Item "WSMan:\localhost\Service\Auth\$a").Value } }
[pscustomobject]@{ Kind = 'Client'; Name = 'TrustedHosts'; Value = (Get-Item WSMan:\localhost\Client\TrustedHosts).Value }
[pscustomobject]@{ Kind = 'Service'; Name = 'AllowUnencrypted'; Value = (Get-Item WSMan:\localhost\Service\AllowUnencrypted).Value }
