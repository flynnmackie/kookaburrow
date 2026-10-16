$Name = 'Remove local user'
$Description = 'Deletes a local account. The profile folder on disk is left in place for forensics. Not reversible.'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'remediation')

if (-not $UserName) { throw 'UserName is required' }
if ($UserName -eq $env:USERNAME) { throw 'Refusing to remove the account this action is running as' }
Get-LocalUser -Name $UserName -ErrorAction Stop | Out-Null
Remove-LocalUser -Name $UserName -ErrorAction Stop
Write-Output "Removed local user '$UserName'"
