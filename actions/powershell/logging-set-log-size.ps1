$Name = 'Logging - Set Log Size'
$Description = 'Sets the maximum size of an event log in MB so important logs are not overwritten during an incident, for example Security or Microsoft-Windows-PowerShell/Operational. The log name is the full name shown by Event Logs - Summary. MaxSizeMB must be from 1 to 4096.'
$Dependencies = @()
$Parameters = @('LogName', 'MaxSizeMB')
$Tags = @('hardening', 'event-logs')

if ($MaxSizeMB -notmatch '^\d+$' -or [int]$MaxSizeMB -lt 1 -or [int]$MaxSizeMB -gt 4096) { throw 'MaxSizeMB must be a number from 1 to 4096' }
$l = Get-WinEvent -ListLog $LogName -ErrorAction Stop
$old = [math]::Round($l.MaximumSizeInBytes / 1MB, 1)
$l.MaximumSizeInBytes = [int64]$MaxSizeMB * 1MB
$l.SaveChanges()
Write-Output "$LogName maximum size changed from $old MB to $MaxSizeMB MB"
