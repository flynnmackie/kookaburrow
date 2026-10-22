$Name = 'Accounts - Add to Group'
$Description = 'Adds a user to a local group such as Administrators, Remote Desktop Users or a custom group. Member is the account name (use DOMAIN\name for a domain account).'
$Dependencies = @()
$Parameters = @('Member', 'Group')
$Tags = @('accounts', 'remediation')

if (-not $Member -or -not $Group) { throw 'Member and Group are required' }
$null = Get-LocalGroup -Name $Group -ErrorAction Stop
Add-LocalGroupMember -Group $Group -Member $Member -ErrorAction Stop
Write-Output "Added $Member to $Group. Members now: $((Get-LocalGroupMember -Group $Group | ForEach-Object { $_.Name }) -join ', ')"
