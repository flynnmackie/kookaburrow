$Name = 'Network - ARP Cache'
$Description = 'The IP to MAC neighbour table. Shows hosts this machine has recently talked to on the local network and can reveal lateral movement or ARP spoofing (duplicate MACs) (like Windows.Network.ArpCache).'
$Dependencies = @()
$Tags = @('network', 'lateral-movement')

Get-NetNeighbor | Where-Object { $_.State -ne 'Unreachable' -and $_.LinkLayerAddress } | Sort-Object IPAddress | Select-Object IPAddress, LinkLayerAddress, State, InterfaceAlias
