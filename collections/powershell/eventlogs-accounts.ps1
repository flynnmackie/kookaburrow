$Name = 'Event Logs - Account Changes'
$Description = 'Account and group management events. Needs administrator rights.'
$Dependencies = @()
$Parameters = @('LastMinutes?', 'StartTime?', 'EndTime?', 'UserContains?', 'MaxEvents?')
$Tags = @('event-logs', 'accounts', 'persistence', 'privilege-escalation')

$ErrorActionPreference = 'Stop'
$ci = [Globalization.CultureInfo]::InvariantCulture
$end = if ($EndTime) { [datetime]::Parse($EndTime, $ci) } else { Get-Date }
$start = if ($StartTime) { [datetime]::Parse($StartTime, $ci) } elseif ($LastMinutes) { $end.AddMinutes(-[double]$LastMinutes) } else { $end.AddHours(-24) }
$max = if ($MaxEvents -match '^\d+$') { [int]$MaxEvents } else { 2000 }
function Get-Data($e) { $h = @{}; foreach ($d in ([xml]$e.ToXml()).Event.EventData.Data) { if ($d.Name) { $h[$d.Name] = $d.'#text' } }; $h }
$what = @{ 4720 = 'User created'; 4722 = 'User enabled'; 4723 = 'Password change attempt'; 4724 = 'Password reset'; 4725 = 'User disabled'; 4726 = 'User deleted'; 4728 = 'Added to global group'; 4729 = 'Removed from global group'; 4732 = 'Added to local group'; 4733 = 'Removed from local group'; 4738 = 'User changed'; 4740 = 'Account locked out'; 4756 = 'Added to universal group'; 4757 = 'Removed from universal group'; 4767 = 'Account unlocked'; 4781 = 'Account renamed' }
try { $events = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = [int[]]$what.Keys; StartTime = $start; EndTime = $end } -ErrorAction Stop } catch { if ($_.Exception.Message -match 'No events were found') { 'No account events in that window.'; return } else { throw } }
$n = 0
foreach ($e in $events) {
    $d = Get-Data $e
    $target = if ($d['MemberName']) { "$($d['MemberName'])" } else { $d['TargetUserName'] }
    if ($UserContains -and "$target $($d['SubjectUserName'])" -notlike "*$UserContains*") { continue }
    [pscustomobject]@{ Time = $e.TimeCreated; Id = $e.Id; Action = $what[$e.Id]; Target = $target; Group = $(if ($d['MemberName']) { $d['TargetUserName'] } else { '' }); ChangedBy = "$($d['SubjectDomainName'])\$($d['SubjectUserName'])"; Computer = $e.MachineName }
    if (++$n -ge $max) { break }
}
