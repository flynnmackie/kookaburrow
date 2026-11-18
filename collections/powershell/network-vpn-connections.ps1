$Name = 'Network - VPN and Remote Access Connections'
$Description = 'VPN connections defined on the host (built-in client), their servers and tunnel types, and the common third-party VPN and remote-access adapters.'
$Dependencies = @()
$Tags = @('network', 'discovery', 'c2')

$ErrorActionPreference = 'SilentlyContinue'
Get-VpnConnection -AllUserConnection | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Server = $_.ServerAddress; Tunnel = "$($_.TunnelType)"; Status = "$($_.ConnectionStatus)"; SplitTunnel = $_.SplitTunneling } }
Get-NetAdapter -IncludeHidden | Where-Object { $_.InterfaceDescription -match 'TAP|WireGuard|OpenVPN|Tailscale|ZeroTier|Wintun|Cisco|Fortinet|Palo Alto|NordLynx|Hamachi' } | ForEach-Object { [pscustomobject]@{ Name = $_.InterfaceDescription; Server = $_.Name; Tunnel = 'adapter'; Status = "$($_.Status)"; SplitTunnel = '' } }
