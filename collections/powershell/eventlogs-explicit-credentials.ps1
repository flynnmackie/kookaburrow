$Name = 'Event Logs - Explicit Credential Use'
$Description = 'Logons made with explicitly supplied credentials (4648): runas, scheduled tasks and pass-the-hash tooling.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'lateral-movement', 'logons')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4648; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Subject = "$($d.SubjectDomainName)\$($d.SubjectUserName)"; Target = "$($d.TargetDomainName)\$($d.TargetUserName)"; Server = $d.TargetServerName; Process = $d.ProcessName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
