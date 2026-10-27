$Name = 'Logging - Enable Process Auditing'
$Description = 'Turns on process creation auditing (Security event 4688) with the full command line in each event, and logon auditing, so program execution and logons are recorded from now on.'
$Dependencies = @()
$Tags = @('hardening', 'event-logs', 'execution')

$o = auditpol.exe /set /subcategory:"Process Creation" /success:enable /failure:enable 2>&1 | Out-String
Write-Output $o.Trim()
$o = auditpol.exe /set /subcategory:"Logon" /success:enable /failure:enable 2>&1 | Out-String
Write-Output $o.Trim()
$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit'
New-Item -Path $k -Force | Out-Null
Set-ItemProperty -Path $k -Name ProcessCreationIncludeCmdLine_Enabled -Value 1 -Type DWord
Write-Output 'Command line logging for process creation enabled.'
