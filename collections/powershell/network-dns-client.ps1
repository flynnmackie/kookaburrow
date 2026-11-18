$Name = 'Network - DNS Client Settings'
$Description = 'DNS servers and search suffixes for every adapter, plus the LLMNR and multicast DNS settings that enable name poisoning.'
$Dependencies = @()
$Tags = @('network', 'dns', 'c2')

$ErrorActionPreference = 'SilentlyContinue'
Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses } | ForEach-Object { [pscustomobject]@{ Setting = "DnsServers $($_.InterfaceAlias) $($_.AddressFamily)"; Value = ($_.ServerAddresses -join ', ') } }
$p = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient'
[pscustomobject]@{ Setting = 'EnableMulticast (LLMNR off when 0)'; Value = $p.EnableMulticast }
$n = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters'
[pscustomobject]@{ Setting = 'NetBT NodeType'; Value = $n.NodeType }
