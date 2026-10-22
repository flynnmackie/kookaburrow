$Name = 'Accounts - Local Groups'
$Description = 'Every local group with its members (users, domain accounts and nested groups). Unexpected members of Administrators, Remote Desktop Users, Backup Operators or Remote Management Users are a standard persistence and lateral movement step.'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($g in Get-LocalGroup) {
    $m = @(Get-LocalGroupMember -Group $g.Name)
    if (-not $m) { [pscustomobject]@{ Group = $g.Name; Member = ''; Type = ''; Source = ''; Sid = '' }; continue }
    foreach ($x in $m) { [pscustomobject]@{ Group = $g.Name; Member = $x.Name; Type = $x.ObjectClass; Source = $x.PrincipalSource; Sid = $x.SID.Value } }
}
