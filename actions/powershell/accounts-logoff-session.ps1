$Name = 'Accounts - Log Off Session'
$Description = 'Logs off one logon session by its session ID (shown by quser or Accounts - Logon Sessions), for example a single RDP session, leaving the account other sessions alone.'
$Dependencies = @()
$Parameters = @('SessionId')
$Tags = @('accounts', 'containment', 'rdp')

if ($SessionId -notmatch '^\d+$' -or [int]$SessionId -le 0) { throw 'SessionId must be a number above 0' }
$q = (quser.exe 2>&1 | Out-String)
logoff.exe $SessionId 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not log off session $SessionId`n$q" }
Write-Output "Logged off session $SessionId"
