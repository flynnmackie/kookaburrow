$Name = 'Accounts - Stored Credentials'
$Description = 'Targets saved in the Windows Credential Manager (cmdkey) for the account running the collection. Names only, never the secrets.'
$Dependencies = @()
$Tags = @('accounts', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$t = ''
foreach ($l in (cmdkey /list 2>&1)) { if ($l -match 'Target:\s*(.+)$') { $t = $Matches[1].Trim() } elseif ($l -match 'Type:\s*(.+)$' -and $t) { [pscustomobject]@{ Target = $t; Type = $Matches[1].Trim() }; $t = '' } }
