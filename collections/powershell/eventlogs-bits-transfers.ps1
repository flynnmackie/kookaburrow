$Name = 'Event Logs - BITS Transfers'
$Description = 'Background Intelligent Transfer Service jobs created and completed (3, 59, 60, 61). BITS is abused to download payloads and move data.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'c2', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Bits-Client/Operational'; Id = 3,59,60,61; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Job = $d.name; Url = $d.url; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
