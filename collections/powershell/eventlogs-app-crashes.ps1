$Name = 'Event Logs - Application Crashes'
$Description = 'Application errors (1000) and hangs (1002): the faulting program, module and exception code. Exploitation often shows as a crash first.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'execution', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000,1002,1026; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Source = $_.ProviderName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
