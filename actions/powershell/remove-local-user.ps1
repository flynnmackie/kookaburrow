$Name = 'Accounts - Remove User'
$Description = 'Deletes a local account.'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'remediation')

if (-not $UserName) { throw 'UserName is required' }
if ($UserName -eq $env:USERNAME) { throw 'Refusing to remove the account this action is running as' }
Get-LocalUser -Name $UserName -ErrorAction Stop | Out-Null
Remove-LocalUser -Name $UserName -ErrorAction Stop
Write-Output "Removed local user '$UserName'"
