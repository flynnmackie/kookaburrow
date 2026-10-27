$Name = 'Event Logs - Logons'
$Description = 'Successful (4624) and failed (4625) logons and explicit-credential logons (4648) with account, logon type, source address and host, process and failure reason. Needs administrator rights.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'LogonTypes?', 'UserContains?', 'OnlyFailures?', 'MaxEvents?')
$Tags = @('event-logs', 'logons', 'lateral-movement', 'brute-force')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$ids = if ($OnlyFailures -match '^(y|yes|true|1)$') { @(4625) } else { @(4624, 4625, 4648) }
$types = @{ 2 = 'Interactive'; 3 = 'Network'; 4 = 'Batch'; 5 = 'Service'; 7 = 'Unlock'; 8 = 'NetworkCleartext'; 9 = 'NewCredentials'; 10 = 'RemoteInteractive'; 11 = 'CachedInteractive' }
$want = if ($LogonTypes) { $LogonTypes -split '[,; ]+' | Where-Object { $_ } } else { $null }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = $ids; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No logon events in that window.'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    $user = if ($e.Id -eq 4648) { $d['TargetUserName'] } else { $d['TargetUserName'] }
    if ($UserContains -and "$user $($d['SubjectUserName'])" -notlike "*$UserContains*") { continue }
    if ($want -and $e.Id -ne 4648 -and $d['LogonType'] -notin $want) { continue }
    [pscustomobject]@{
        Time = $e.TimeCreated; Id = $e.Id; Outcome = switch ($e.Id) { 4624 { 'Success' } 4625 { 'Failure' } default { 'ExplicitCreds' } }
        User = $user; Domain = $d['TargetDomainName']; LogonType = if ($d['LogonType']) { "$($d['LogonType']) $($types[[int]$d['LogonType']])" } else { '' }
        SourceIp = $d['IpAddress']; SourcePort = $d['IpPort']; SourceHost = $d['WorkstationName']; Process = $d['ProcessName']; AuthPackage = $d['AuthenticationPackageName']
        FailureStatus = $d['SubStatus']; SubjectUser = $d['SubjectUserName']; TargetServer = $d['TargetServerName']
    }
    if (++$n -ge $max) { break }
}
