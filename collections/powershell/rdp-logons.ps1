$Name = 'RDP - Logons'
$Description = 'Remote Desktop activity from the event logs. Needs administrator rights.'
$Dependencies = @()
$Tags = @('lateral-movement', 'rdp', 'logons', 'event-logs')
$DiffIgnore = @('Time', 'Count')

$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-14)

function Get-EventData($e) {
    $d = @{}
    ([xml]$e.ToXml()).Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
    $d
}

# One row per event of the last 14 days, Kind saying which: RDP connections accepted (TerminalServices 1149), RemoteInteractive and
# Unlock logons (4624 type 10 and 7), and failed RDP logons (4625 type 10) counted per source address. Time and Count are not
# compared, so a row is new only for a new account, logon type or source.
Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational'; Id = 1149; StartTime = $since } -MaxEvents 500 | ForEach-Object {
    $x = ([xml]$_.ToXml()).Event.UserData.EventXML
    [pscustomobject]@{ Kind = 'RDP accepted (1149)'; User = "$($x.Param2)\$($x.Param1)"; Type = ''; Source = $x.Param3; Time = $_.TimeCreated; Count = '' }
}
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4624; StartTime = $since } -MaxEvents 5000 | ForEach-Object {
    $d = Get-EventData $_
    if ($d.LogonType -in '10', '7') { [pscustomobject]@{ Kind = 'Logon (4624)'; User = "$($d.TargetDomainName)\$($d.TargetUserName)"; Type = $d.LogonType; Source = $d.IpAddress; Time = $_.TimeCreated; Count = '' } }
} | Select-Object -First 100
Get-WinEvent -FilterHashtable @{ LogName = 'Security'; Id = 4625; StartTime = $since } -MaxEvents 5000 |
    ForEach-Object { $d = Get-EventData $_; if ($d.LogonType -eq '10') { $d.IpAddress } } |
    Group-Object | Sort-Object Count -Descending | ForEach-Object {
        [pscustomobject]@{ Kind = 'Failed RDP logons (4625)'; User = ''; Type = '10'; Source = $_.Name; Time = ''; Count = $_.Count }
    }
