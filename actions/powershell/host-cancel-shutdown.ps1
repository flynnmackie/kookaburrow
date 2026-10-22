$Name = 'Host - Cancel Shutdown'
$Description = 'Cancels a pending restart or shutdown started with Host - Restart or Host - Shutdown, if the delay has not yet run out.'
$Dependencies = @()
$Tags = @('recovery', 'host')

$o = shutdown.exe /a 2>&1
if ($LASTEXITCODE -eq 0) { Write-Output 'The pending shutdown was cancelled.' } else { Write-Output "Nothing to cancel: $($o | Out-String)".Trim() }
