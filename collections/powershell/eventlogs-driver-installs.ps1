$Name = 'Event Logs - Driver and Device Installs'
$Description = 'Device and driver installation events (Kernel-PnP, UserPnp 20001, 20003). New drivers and devices are a route to kernel code and removable media use.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'persistence', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 720 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 20001,20003,219; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Source = $_.ProviderName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
