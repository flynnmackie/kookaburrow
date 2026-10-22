$Name = 'Files - Writable Program Folders'
$Description = 'Folders that ordinary users can write to inside a program location, found with Sysinternals AccessChk. A user-writable folder in a service or scheduled task path allows DLL planting and binary replacement for privilege escalation. ScanPath defaults to C:\Program Files. Needs the accesschk64.exe single-file binary uploaded under Settings, Binaries.'
$Dependencies = @('accesschk64.exe')
$Parameters = @('ScanPath?')
$Tags = @('privilege-escalation', 'filesystem', 'persistence')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'accesschk64.exe'
$path = if ($ScanPath) { $ScanPath } else { "$env:ProgramFiles" }
$found = $false
foreach ($who in 'Users', 'Everyone', 'Authenticated Users') {
    foreach ($l in (& $exe -accepteula -nobanner -uwdqs $who $path 2>$null)) {
        if ($l -match '^\s*(RW|W)\s+(.+)$') { $found = $true; [pscustomobject]@{ Folder = $Matches[2].Trim(); Access = $Matches[1]; WritableBy = $who } }
    }
}
if (-not $found) { "No folders under $path are writable by ordinary users." }
