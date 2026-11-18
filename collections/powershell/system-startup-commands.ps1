$Name = 'System - Startup Commands'
$Description = 'The Win32_StartupCommand list: programs that start at logon from Run keys and Startup folders, with the user they belong to.'
$Dependencies = @()
$Tags = @('persistence', 'autoruns')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_StartupCommand | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Command = $_.Command; Location = $_.Location; User = $_.User } }
