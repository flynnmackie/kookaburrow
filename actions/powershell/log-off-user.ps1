$Name = 'Accounts - Log Off User'
$Description = 'Logs off every interactive or RDP session belonging to the given user name.'
$Dependencies = @()
$Parameters = @('UserName')
$Tags = @('accounts', 'containment', 'logons')

if (-not $UserName -or $UserName -match '[\*\?]') { throw 'UserName is required and must not contain wildcards' }
$found = $false
foreach ($line in (quser 2>$null | Select-Object -Skip 1)) {
    $t = ($line -replace '^\s*>', '').Trim() -split '\s+'
    if ($t[0] -ieq $UserName) {
        $id = $t | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1
        logoff $id
        Write-Output "Logged off $($t[0]) (session $id)"
        $found = $true
    }
}
if (-not $found) { Write-Output "No session found for '$UserName'." }
