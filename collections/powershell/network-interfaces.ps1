$Name = 'Network - Interfaces'
$Description = 'Network adapters with MAC, link state, IP addresses, gateways and DNS servers, plus the routing table. Shows unexpected adapters (VPN, tunnels, virtual) and rogue DNS or gateway settings (like Windows.Network.InterfaceAddresses).'
$Dependencies = @()
$Tags = @('network', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
Get-NetAdapter | ForEach-Object {
    $a = $_
    $ip = try { Get-NetIPConfiguration -InterfaceIndex $a.ifIndex -ErrorAction Stop } catch { $null }
    [pscustomobject]@{
        Item = 'Adapter'; Name = $a.Name; Description = $a.InterfaceDescription; Mac = $a.MacAddress; Status = $a.Status; Speed = $a.LinkSpeed
        Address = (@($ip.IPv4Address.IPAddress) + @($ip.IPv6Address.IPAddress) -join ', '); Gateway = ($ip.IPv4DefaultGateway.NextHop -join ', '); Dns = (@($ip.DNSServer.ServerAddresses) -join ', ')
    }
}
Get-NetRoute -AddressFamily IPv4 | Where-Object { $_.DestinationPrefix -ne '255.255.255.255/32' -and $_.DestinationPrefix -notlike '224.*' } | ForEach-Object {
    [pscustomobject]@{ Item = 'Route'; Name = $_.DestinationPrefix; Description = "ifIndex $($_.InterfaceIndex)"; Mac = ''; Status = ''; Speed = ''; Address = $_.NextHop; Gateway = ''; Dns = "metric $($_.RouteMetric)" }
}
