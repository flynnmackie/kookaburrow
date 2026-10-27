$Name = 'Network - Disable Adapter'
$Description = 'Disables one network adapter by name (as shown by Network - Interfaces), cutting the host off from that network.'
$Dependencies = @()
$Parameters = @('AdapterName')
$Tags = @('containment', 'network')

if (-not $AdapterName) { throw 'AdapterName is required' }
$a = Get-NetAdapter -Name $AdapterName -ErrorAction Stop
Disable-NetAdapter -Name $AdapterName -Confirm:$false -ErrorAction Stop
Write-Output "Disabled adapter $AdapterName ($($a.InterfaceDescription), $($a.MacAddress))"
