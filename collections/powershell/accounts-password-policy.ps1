$Name = 'Accounts - Password and Lockout Policy'
$Description = 'Local password policy and account lockout settings from net accounts: length, age, history and lockout threshold.'
$Dependencies = @()
$Tags = @('accounts', 'security')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($l in (net accounts 2>&1)) { if ($l -match '^(.+?):\s{2,}(.+)$') { [pscustomobject]@{ Setting = $Matches[1].Trim(); Value = $Matches[2].Trim() } } }
