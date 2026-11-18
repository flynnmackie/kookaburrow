$Name = 'Event Logs - Failed Logons'
$Description = 'Failed logons (4625) with the account, source address, logon type and failure reason, for password guessing and spraying.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'brute-force', 'logons')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 24 }
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = (Get-Date).AddHours(-$h) } -MaxEvents 1000 | ForEach-Object { $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; Account = "$($d.TargetDomainName)\$($d.TargetUserName)"; Source = $d.IpAddress; LogonType = $d.LogonType; Status = $d.Status; SubStatus = $d.SubStatus; Process = $d.ProcessName } }
