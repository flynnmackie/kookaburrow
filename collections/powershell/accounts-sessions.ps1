$Name = 'Accounts - Logon Sessions'
$Description = 'Current logon sessions with the account, logon type, authentication package and start time (interactive, remote, service, network).'
$Dependencies = @()
$Tags = @('accounts', 'logons', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
$types = @{ 2 = 'Interactive'; 3 = 'Network'; 4 = 'Batch'; 5 = 'Service'; 7 = 'Unlock'; 8 = 'NetworkCleartext'; 9 = 'NewCredentials'; 10 = 'RemoteInteractive'; 11 = 'CachedInteractive' }
$sessions = @{}
Get-CimInstance Win32_LogonSession | ForEach-Object { $sessions[$_.LogonId] = $_ }
Get-CimInstance Win32_LoggedOnUser | ForEach-Object {
    $id = $_.Dependent.LogonId; $s = $sessions[$id]
    [pscustomobject]@{ User = "$($_.Antecedent.Domain)\$($_.Antecedent.Name)"; LogonId = $id; LogonType = $types[[int]$s.LogonType]; AuthPackage = $s.AuthenticationPackage; Started = $s.StartTime }
} | Sort-Object Started -Descending
