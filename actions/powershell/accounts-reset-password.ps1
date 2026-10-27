$Name = 'Accounts - Reset Password'
$Description = 'Sets a new password on a local account.'
$Dependencies = @()
$Parameters = @('UserName', 'NewPassword')
$Tags = @('accounts', 'remediation', 'containment')

if (-not $UserName -or -not $NewPassword) { throw 'UserName and NewPassword are required' }
$u = Get-LocalUser -Name $UserName -ErrorAction Stop
Set-LocalUser -Name $UserName -Password (ConvertTo-SecureString $NewPassword -AsPlainText -Force) -ErrorAction Stop
Write-Output "Password reset for local account $UserName (enabled: $($u.Enabled))"
