$Name = 'Event Logs - Print Jobs and Spooler'
$Description = 'Documents printed (307) and spooler service events. Printing sensitive documents is a data theft route; spooler errors can mark exploitation.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'forensics', 'exfiltration')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-PrintService/Operational'; Id = 307,808,823; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Source = $_.ProviderName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
