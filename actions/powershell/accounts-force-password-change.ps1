$Name = 'Accounts - Force Password Change'
$Description = 'Makes a local account choose a new password at its next logon (the password is marked expired). Use it after a suspected credential exposure when you cannot reset the password yourself.'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'remediation')

if (-not $UserName) { throw 'UserName is required' }
$null = Get-LocalUser -Name $UserName -ErrorAction Stop
$o = net.exe user $UserName /logonpasswordchg:yes 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw $o.Trim() }
Write-Output "$UserName must change the password at the next logon."
