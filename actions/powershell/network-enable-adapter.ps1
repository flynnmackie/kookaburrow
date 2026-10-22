$Name = 'Network - Enable Adapter'
$Description = 'Enables a network adapter that was disabled, by name (as shown by Network - Interfaces).'
$Dependencies = @()
$Parameters = @('AdapterName')
$Tags = @('recovery', 'network')

if (-not $AdapterName) { throw 'AdapterName is required' }
Enable-NetAdapter -Name $AdapterName -Confirm:$false -ErrorAction Stop
Write-Output "Enabled adapter $AdapterName ($((Get-NetAdapter -Name $AdapterName).Status))"
