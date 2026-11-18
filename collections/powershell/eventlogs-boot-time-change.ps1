$Name = 'Event Logs - Startup, Shutdown and Time Changes'
$Description = 'System start (6005), stop (6006), unexpected shutdown (6008) and clock changes (1, 4616). Clock changes can hide activity or break log correlation.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'defense-evasion', 'system')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 720 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 6005,6006,6008,1074; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Source = $_.ProviderName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
