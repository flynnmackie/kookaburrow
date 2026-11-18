$Name = 'Event Logs - WinRM Activity'
$Description = 'WinRM sessions received (91, 168) and their authentication. Shows remote PowerShell and remote command execution.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WinRM/Operational'; Id = 6,91,168,169; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; User = $d.username; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
