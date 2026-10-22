$Name = 'Services - Restart'
$Description = 'Restarts a service by its short name, for example after changing its configuration or to reload a security agent.'
$Dependencies = @()
$Parameters = @('ServiceName')
$Tags = @('recovery', 'services')

if (-not $ServiceName) { throw 'ServiceName is required' }
Restart-Service -Name $ServiceName -Force -ErrorAction Stop
Write-Output "$ServiceName is $((Get-Service -Name $ServiceName).Status)"
