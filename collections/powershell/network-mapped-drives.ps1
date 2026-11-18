$Name = 'Network - Mapped Drives and Connections'
$Description = 'SMB connections and mapped drives of the current session, and the network drives remembered in the registry.'
$Dependencies = @()
$Tags = @('network', 'lateral-movement', 'smb')

$ErrorActionPreference = 'SilentlyContinue'
Get-SmbMapping | ForEach-Object { [pscustomobject]@{ Kind = 'Mapped'; Local = $_.LocalPath; Remote = $_.RemotePath; Status = "$($_.Status)" } }
Get-SmbConnection | ForEach-Object { [pscustomobject]@{ Kind = 'Connection'; Local = $_.UserName; Remote = "\\$($_.ServerName)\$($_.ShareName)"; Status = "$($_.Dialect)" } }
