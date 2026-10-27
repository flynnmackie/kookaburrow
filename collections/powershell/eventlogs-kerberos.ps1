$Name = 'Event Logs - Kerberos'
$Description = 'Kerberos and NTLM authentication on a domain controller.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'UserContains?', 'MaxEvents?')
$Tags = @('event-logs', 'accounts', 'lateral-movement', 'brute-force')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddMinutes(-60) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = @(4768, 4769, 4771, 4776); StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No Kerberos or NTLM events in that window (run this on a domain controller).'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    $user = if ($d['TargetUserName']) { $d['TargetUserName'] } else { $d['TargetUserName'] }
    if ($UserContains -and "$user" -notlike "*$UserContains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Kind = $(switch ($e.Id) { 4768 { 'TGT request' } 4769 { 'Service ticket' } 4771 { 'Pre-auth failed' } default { 'NTLM validation' } }); User = $user; Service = $d['ServiceName']; ClientIp = ($d['IpAddress'] -replace '^::ffff:', ''); Encryption = $d['TicketEncryptionType']; Status = $(if ($d['Status']) { $d['Status'] } else { $d['ResultCode'] }); Workstation = $d['Workstation'] }
    if (++$n -ge $max) { break }
}
