$Name = 'Accounts - Enable User'
$Description = 'Enables a local account that was disabled, for example one disabled by Accounts - Disable User during containment.'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'recovery')

if (-not $UserName) { throw 'UserName is required' }
$null = Get-LocalUser -Name $UserName -ErrorAction Stop
Enable-LocalUser -Name $UserName -ErrorAction Stop
Write-Output "Enabled local account $UserName"
