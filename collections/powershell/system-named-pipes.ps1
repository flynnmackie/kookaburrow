$Name = 'System - Named Pipes'
$Description = 'Every named pipe currently open.'
$Dependencies = @()
$Tags = @('c2', 'lateral-movement', 'execution')

[System.IO.Directory]::GetFiles('\\.\pipe\') | ForEach-Object { [pscustomobject]@{ Pipe = $_ -replace '^\\\\\.\\pipe\\', '' } } | Sort-Object Pipe
