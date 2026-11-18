$Name = 'Accounts - Disabled and Stale Local Accounts'
$Description = 'Local accounts that are disabled, never logged on, or have not logged on for a long time. Dormant accounts are a favourite hiding place.'
$Dependencies = @()
$Tags = @('accounts', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
Get-LocalUser | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Enabled = $_.Enabled; LastLogon = $_.LastLogon; PasswordLastSet = $_.PasswordLastSet; PasswordRequired = $_.PasswordRequired; Description = $_.Description } }
