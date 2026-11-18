$Name = 'RDP - Server Configuration'
$Description = 'Whether Remote Desktop is enabled, network level authentication, the listening port and the security layer.'
$Dependencies = @()
$Tags = @('rdp', 'lateral-movement', 'security')

$ErrorActionPreference = 'SilentlyContinue'
$t = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
$w = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp'
[pscustomobject]@{ Setting = 'RDP enabled (fDenyTSConnections = 0)'; Value = $t.fDenyTSConnections }
[pscustomobject]@{ Setting = 'Network Level Authentication'; Value = $w.UserAuthentication }
[pscustomobject]@{ Setting = 'PortNumber'; Value = $w.PortNumber }
[pscustomobject]@{ Setting = 'SecurityLayer'; Value = $w.SecurityLayer }
[pscustomobject]@{ Setting = 'MinEncryptionLevel'; Value = $w.MinEncryptionLevel }
