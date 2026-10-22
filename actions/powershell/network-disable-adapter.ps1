$Name = 'Network - Disable Adapter'
$Description = 'Disables one network adapter by name (as shown by Network - Interfaces), cutting the host off from that network. Disabling the adapter this host is managed over will end your contact with it; use Host - Isolate to keep access from your server.'
$Dependencies = @()
$Parameters = @('AdapterName')
$Tags = @('containment', 'network')

if (-not $AdapterName) { throw 'AdapterName is required' }
$a = Get-NetAdapter -Name $AdapterName -ErrorAction Stop
Disable-NetAdapter -Name $AdapterName -Confirm:$false -ErrorAction Stop
Write-Output "Disabled adapter $AdapterName ($($a.InterfaceDescription), $($a.MacAddress))"
