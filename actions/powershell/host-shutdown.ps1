$Name = 'Host - Shutdown'
$Description = 'Powers the host off, optionally after DelaySeconds (default 30) with a message shown to logged-on users. The host will not come back until someone starts it, so use it only when you must stop a compromised machine, and collect volatile evidence first.'
$Dependencies = @()
$Parameters = @('DelaySeconds?', 'Message?')
$Tags = @('containment', 'host')

$d = if ($DelaySeconds -match '^\d+$') { [int]$DelaySeconds } else { 30 }
$m = if ($Message) { $Message } else { 'Shutting down for security reasons' }
shutdown.exe /s /t $d /c $m /d p:4:1
Write-Output "Shutdown scheduled in $d seconds. Use Host - Cancel Shutdown to stop it."
