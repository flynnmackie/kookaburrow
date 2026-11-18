$Name = 'Event Logs - DNS Client Lookups'
$Description = 'DNS lookups logged by the DNS Client service (3008, 3010). A cheap, always-on record of names the host resolved. Needs the log enabled.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'dns', 'c2')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 24 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-DNS-Client/Operational'; Id = 3008,3010,3020; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Query = $d.QueryName; Result = $d.QueryResults; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
