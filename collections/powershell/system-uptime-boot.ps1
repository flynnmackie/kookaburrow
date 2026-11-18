$Name = 'System - Boot Time and Uptime'
$Description = 'Last boot time, uptime and the install date of the operating system.'
$Dependencies = @()
$Tags = @('system', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$o = Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{ LastBoot = $o.LastBootUpTime; UptimeHours = [math]::Round(((Get-Date) - $o.LastBootUpTime).TotalHours, 1); InstallDate = $o.InstallDate; Build = $o.BuildNumber; Edition = $o.Caption; Architecture = $o.OSArchitecture }
