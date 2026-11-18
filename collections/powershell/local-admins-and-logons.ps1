$Name = 'Accounts - Local Admins'
$Description = 'Local Administrators members and the last 50 successful logons (Windows; logons need admin).'
$Dependencies = @()
$Tags = @('accounts', 'logons', 'event-logs')
$DiffIgnore = @('Time')

# One row per Administrators member (Kind Administrator) and per recent interactive, network or RDP logon (Kind Logon, 4624 type
# 2/3/10). Time is not compared, so a logon counts as new only for a new account, type or source address.
Get-LocalGroupMember -Group 'Administrators' | ForEach-Object {
    [pscustomobject]@{ Kind = 'Administrator'; Name = $_.Name; Type = "$($_.ObjectClass)"; Source = "$($_.PrincipalSource)"; Time = '' }
}
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 500 -ErrorAction SilentlyContinue |
    ForEach-Object {
        $x = [xml]$_.ToXml()
        $d = @{}; $x.Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
        if ($d.LogonType -in '2','3','10') {
            [pscustomobject]@{ Kind = 'Logon'; Name = "$($d.TargetDomainName)\$($d.TargetUserName)"; Type = $d.LogonType; Source = $d.IpAddress; Time = $_.TimeCreated }
        }
    } | Select-Object -First 50
