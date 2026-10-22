$Name = 'Services - Set Startup Type'
$Description = 'Sets how a service starts: Automatic, Manual or Disabled. Setting a suspicious service to Disabled stops it coming back after a reboot without deleting it. Does not stop a service that is already running (use Services - Stop and Disable for that).'
$Dependencies = @()
$Parameters = @('ServiceName', 'StartupType')
$Tags = @('services', 'remediation')

if ($StartupType -notin 'Automatic', 'Manual', 'Disabled') { throw 'StartupType must be Automatic, Manual or Disabled' }
$s = Get-Service -Name $ServiceName -ErrorAction Stop
Set-Service -Name $ServiceName -StartupType $StartupType -ErrorAction Stop
Write-Output "$ServiceName ($($s.Status)) startup type is now $StartupType"
