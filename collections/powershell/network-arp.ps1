$Name = 'Network - ARP Cache'
$Description = 'The IP to MAC neighbour table.'
$Dependencies = @()
$Tags = @('network', 'lateral-movement')

Get-NetNeighbor | Where-Object { $_.State -ne 'Unreachable' -and $_.LinkLayerAddress } | Sort-Object IPAddress | Select-Object IPAddress, LinkLayerAddress, State, InterfaceAlias
