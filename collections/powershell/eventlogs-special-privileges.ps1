$Name = 'Event Logs - Special Privileges Assigned'
$Description = 'Logons that received sensitive privileges (4672): administrators and service accounts, with the privileges listed.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'privilege-escalation', 'logons')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4672; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Account = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Privileges = ($d.PrivilegeList -replace '\s+', ' '); Message = (($_.Message -split [Environment]::NewLine)[0]) } }
