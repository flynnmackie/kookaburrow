$Name = 'Local admins and recent logons'
$Description = 'Local Administrators members and the last 50 successful logons (Windows; logons need admin).'
$Dependencies = @()
$Tags = @('accounts', 'logons', 'event-logs')

'== Local Administrators =='
Get-LocalGroupMember -Group 'Administrators' | Format-Table Name, ObjectClass, PrincipalSource -AutoSize
'== Recent logons (4624, type 2/3/10) =='
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 500 -ErrorAction SilentlyContinue |
    ForEach-Object {
        $x = [xml]$_.ToXml()
        $d = @{}; $x.Event.EventData.Data | ForEach-Object { $d[$_.Name] = $_.'#text' }
        if ($d.LogonType -in '2','3','10') {
            [pscustomobject]@{ Time=$_.TimeCreated; User="$($d.TargetDomainName)\$($d.TargetUserName)"; Type=$d.LogonType; Source=$d.IpAddress }
        }
    } | Select-Object -First 50 | Format-Table -AutoSize
