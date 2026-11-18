$Name = 'Event Logs - Size and Retention'
$Description = 'Maximum size, retention mode and record count of the main event logs. Tiny or non-retained logs lose evidence quickly.'
$Dependencies = @()
$Tags = @('event-logs', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($n in 'Security', 'System', 'Application', 'Microsoft-Windows-PowerShell/Operational', 'Microsoft-Windows-Sysmon/Operational', 'Microsoft-Windows-TaskScheduler/Operational', 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', 'Microsoft-Windows-WinRM/Operational') { $l = Get-WinEvent -ListLog $n; if ($l) { [pscustomobject]@{ Log = $n; Enabled = $l.IsEnabled; MaxMB = [math]::Round($l.MaximumSizeInBytes / 1MB, 1); Mode = "$($l.LogMode)"; Records = $l.RecordCount; Oldest = (Get-WinEvent -LogName $n -MaxEvents 1 -Oldest).TimeCreated } } }
