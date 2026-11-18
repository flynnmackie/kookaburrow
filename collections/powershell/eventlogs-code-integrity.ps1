$Name = 'Event Logs - Code Integrity Failures'
$Description = 'Files that failed signature or policy checks (3033, 3034, 3076, 3077): unsigned drivers and blocked programs.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'defense-evasion', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-CodeIntegrity/Operational'; Id = 3033,3034,3076,3077; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; File = $d.FileNameBuffer; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
