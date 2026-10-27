$Name = 'Host - Release'
$Description = 'Undoes Host - Isolate: removes the isolation allow rules, restores the firewall profile defaults and switches the saved allow rules back on, and cancels any automatic release.'
$Dependencies = @()
$Tags = @('containment', 'network', 'recovery')

$state = 'C:\ProgramData\Kookaburrow\isolation-state.json'
if (-not (Test-Path -LiteralPath $state)) { Write-Output 'The host is not isolated (no saved state).'; return }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\ProgramData\Kookaburrow\release-isolation.ps1'
if (Test-Path -LiteralPath $state) { throw 'Release did not complete: the saved state is still present' }
Write-Output 'Released: firewall rules and profile defaults are restored.'
