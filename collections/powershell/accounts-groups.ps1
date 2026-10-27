$Name = 'Accounts - Local Groups'
$Description = 'Every local group with its members (users, domain accounts and nested groups).'
$Dependencies = @()
$Tags = @('accounts', 'privilege-escalation', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($g in Get-LocalGroup) {
    $m = @(Get-LocalGroupMember -Group $g.Name)
    if (-not $m) { [pscustomobject]@{ Group = $g.Name; Member = ''; Type = ''; Source = ''; Sid = '' }; continue }
    foreach ($x in $m) { [pscustomobject]@{ Group = $g.Name; Member = $x.Name; Type = $x.ObjectClass; Source = $x.PrincipalSource; Sid = $x.SID.Value } }
}
