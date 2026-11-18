$Name = 'Event Logs - NTLM Credential Validation'
$Description = 'NTLM authentications validated by this host (4776) with the workstation they came from. Heavy NTLM use points at relay and pass-the-hash.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'lateral-movement', 'logons')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4776; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Account = $d.TargetUserName; Workstation = $d.Workstation; Status = $d.Status; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
