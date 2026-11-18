$Name = 'Event Logs - Account Lockouts'
$Description = 'Accounts that were locked out (4740) and the machine the bad passwords came from.'
$Dependencies = @()
$Parameters = @('Hours?')
$Tags = @('event-logs', 'brute-force', 'accounts')

$ErrorActionPreference = 'SilentlyContinue'
$h = if ($Hours) { [int]$Hours } else { 168 }
$s = (Get-Date).AddHours(-$h)
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4740; StartTime = $s } -MaxEvents 500 | ForEach-Object {
 $x = [xml]$_.ToXml(); $d = @{}; foreach ($n in $x.Event.EventData.Data) { if ($n.Name) { $d[$n.Name] = $n.'#text' } }
 [pscustomobject]@{ Time = $_.TimeCreated; EventId = $_.Id; Account = $d.TargetUserName; CallerComputer = $d.TargetDomainName; Message = (($_.Message -split [Environment]::NewLine)[0]) } }
