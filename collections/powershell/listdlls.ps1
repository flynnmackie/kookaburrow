$Name = 'Processes - Loaded DLLs'
$Description = 'DLLs loaded in each running process (base address, size, version and path), from Sysinternals ListDLLs. ProcessName limits to one process (name or PID). Injected or side-loaded DLLs from user folders or without a version stand out. Needs the listdlls64.exe single-file binary uploaded under Settings, Binaries. Needs administrator rights.'
$Dependencies = @('listdlls64.exe')
$Parameters = @('ProcessName?')
$Tags = @('processes', 'malware', 'defense-evasion')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'listdlls64.exe'
$a = @('-accepteula')
if ($ProcessName) { $a += $ProcessName }
$proc = ''; $procId = ''
foreach ($l in (& $exe @a 2>$null)) {
    if ($l -match '^(.+?)\s+pid:\s*(\d+)\s*$') { $proc = $Matches[1].Trim(); $procId = $Matches[2]; continue }
    if ($l -match '^\s*0x[0-9a-fA-F`]+\s+0x[0-9a-fA-F]+\s+(?:(\S+)\s+)?([A-Za-z]:\\.*|\\\\.*)$') { [pscustomobject]@{ Process = $proc; Pid = $procId; Version = $Matches[1]; Dll = $Matches[2].Trim() } }
}
