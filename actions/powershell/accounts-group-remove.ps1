$Name = 'Accounts - Remove from Group'
$Description = 'Removes a user from a local group, for example from Administrators to take away rights an attacker granted.'
$Dependencies = @()
$Parameters = @('Member', 'Group')
$Tags = @('accounts', 'remediation', 'containment')

if (-not $Member -or -not $Group) { throw 'Member and Group are required' }
$null = Get-LocalGroup -Name $Group -ErrorAction Stop
Remove-LocalGroupMember -Group $Group -Member $Member -ErrorAction Stop
Write-Output "Removed $Member from $Group. Members now: $((Get-LocalGroupMember -Group $Group | ForEach-Object { $_.Name }) -join ', ')"
