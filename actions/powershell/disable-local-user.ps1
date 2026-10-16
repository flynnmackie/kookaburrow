$Name = 'Disable local user'
$Description = 'Disables a local account so it can no longer log on, without deleting it or its profile (reversible).'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'containment')

if (-not $UserName) { throw 'UserName is required' }
$u = Get-LocalUser -Name $UserName -ErrorAction Stop
if (-not $u.Enabled) { Write-Output "'$UserName' is already disabled."; return }
Disable-LocalUser -Name $UserName -ErrorAction Stop
Write-Output "Disabled local user '$UserName'"
