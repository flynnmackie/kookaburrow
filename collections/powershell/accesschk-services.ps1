$Name = 'Services - Weak Permissions'
$Description = 'Services that ordinary accounts can change (Everyone, Users, Authenticated Users, Interactive) found with Sysinternals AccessChk.'
$Dependencies = @('accesschk64.exe')
$Tags = @('services', 'privilege-escalation', 'persistence')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'accesschk64.exe'
$found = $false
foreach ($who in 'Everyone', 'Users', 'Authenticated Users', 'INTERACTIVE') {
    $svc = ''
    foreach ($l in (& $exe -accepteula -nobanner -uwcqv $who '*' 2>$null)) {
        if ($l -match '^\S') { $svc = $l.Trim(); continue }
        if ($l -match '^\s+(RW|R|W)\s+(.+)$' -and $svc) { $found = $true; [pscustomobject]@{ Service = $svc; Account = $Matches[2].Trim(); Access = $Matches[1]; CheckedFor = $who } }
        elseif ($l -match '^\s+(SERVICE_[A-Z_]+|WRITE_DAC|WRITE_OWNER)' -and $svc) { [pscustomobject]@{ Service = $svc; Account = $who; Access = $l.Trim(); CheckedFor = $who } }
    }
}
if (-not $found) { 'No services writable by ordinary accounts.' }
