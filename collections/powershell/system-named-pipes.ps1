$Name = 'System - Named Pipes'
$Description = 'Every named pipe currently open. Many C2 frameworks and lateral-movement tools use well-known pipe names (msagent_, postex_, status_, MSSE-, psexesvc and similar). Compare against a baseline (like Windows.Detection.NamedPipes).'
$Dependencies = @()
$Tags = @('c2', 'lateral-movement', 'execution')

[System.IO.Directory]::GetFiles('\\.\pipe\') | ForEach-Object { [pscustomobject]@{ Pipe = $_ -replace '^\\\\\.\\pipe\\', '' } } | Sort-Object Pipe
