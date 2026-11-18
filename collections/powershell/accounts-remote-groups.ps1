$Name = 'Accounts - Remote Access Groups'
$Description = 'Members of the groups that allow remote access: Remote Desktop Users, Remote Management Users, Distributed COM Users, Backup Operators and Network Configuration Operators.'
$Dependencies = @()
$Tags = @('accounts', 'lateral-movement', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($g in 'Remote Desktop Users', 'Remote Management Users', 'Distributed COM Users', 'Backup Operators', 'Network Configuration Operators', 'Event Log Readers') { $m = Get-LocalGroupMember -Group $g; foreach ($x in $m) { [pscustomobject]@{ Group = $g; Member = $x.Name; Type = "$($x.ObjectClass)"; Source = "$($x.PrincipalSource)" } } }
