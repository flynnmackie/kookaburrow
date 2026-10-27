$Name = 'RDP - Logons'
$Description = 'Remote Desktop activity from the event logs. Needs administrator rights.'
$Dependencies = @()
$Tags = @('lateral-movement', 'rdp', 'logons', 'event-logs')

$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-14)

function Get-EventData($e) {
    $d = @{}
    ([xml]$e.ToXml()).Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
    $d
}

"== RDP connections accepted (last 14 days, TerminalServices 1149) =="
$ts = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational'; Id = 1149; StartTime = $since } -MaxEvents 500
if ($ts) {
    $ts | ForEach-Object {
        $x = ([xml]$_.ToXml()).Event.UserData.EventXML
        [pscustomobject]@{ Time = $_.TimeCreated; User = "$($x.Param2)\$($x.Param1)"; Source = $x.Param3 }
    } | Format-Table -AutoSize
} else { '(none, or log not readable)' }

"== Logons type 10 (RemoteInteractive) and 7 (Unlock), 4624 =="
$ok = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4624; StartTime = $since } -MaxEvents 5000
if ($ok) {
    $ok | ForEach-Object { $d = Get-EventData $_; if ($d.LogonType -in '10', '7') {
        [pscustomobject]@{ Time = $_.TimeCreated; User = "$($d.TargetDomainName)\$($d.TargetUserName)"; Type = $d.LogonType; Source = $d.IpAddress }
    } } | Select-Object -First 100 | Format-Table -AutoSize
} else { '(none, or Security log not readable: run with administrator rights)' }

"== Failed RDP logons by source (4625 type 10) =="
$bad = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = $since } -MaxEvents 5000
if ($bad) {
    $bad | ForEach-Object { $d = Get-EventData $_; if ($d.LogonType -eq '10') { $d.IpAddress } } |
        Group-Object | Sort-Object Count -Descending | Select-Object Count, @{ n = 'Source'; e = { $_.Name } } | Format-Table -AutoSize
} else { '(none)' }
