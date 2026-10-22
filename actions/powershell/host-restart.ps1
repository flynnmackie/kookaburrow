$Name = 'Host - Restart'
$Description = 'Restarts the host, optionally after DelaySeconds (default 30) with a message shown to logged-on users. Restarting clears memory, so collect volatile evidence first.'
$Dependencies = @()
$Parameters = @('DelaySeconds?', 'Message?')
$Tags = @('containment', 'recovery', 'host')

$d = if ($DelaySeconds -match '^\d+$') { [int]$DelaySeconds } else { 30 }
$m = if ($Message) { $Message } else { 'Restarting for security maintenance' }
shutdown.exe /r /t $d /c $m /d p:4:1
Write-Output "Restart scheduled in $d seconds. Use Host - Cancel Shutdown to stop it."
