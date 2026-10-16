$Name = 'Running processes'
$Description = 'Process list with path, parent PID and command line (Windows).'
$Dependencies = @()
$Tags = @('processes', 'execution', 'discovery')

Get-CimInstance Win32_Process |
    Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine |
    Sort-Object ProcessId | Format-Table -AutoSize -Wrap
