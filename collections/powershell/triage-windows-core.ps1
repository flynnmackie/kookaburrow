$Name = 'Triage - Windows Core'
$Description = 'A native KAPE-style quick triage with no extra tools: Prefetch, shortcuts and Jump Lists, scheduled task XML, SRUM database, the registry hives (SYSTEM, SOFTWARE, SAM, SECURITY, Amcache and every NTUSER.DAT and UsrClass.dat), PowerShell history, the hosts file, and the Security, System, Application, PowerShell and Sysmon event logs for the last EventDays days (default 7). Locked files are copied from a volume shadow. Typically 100 to 600 MB. Includes credential material (SAM, SECURITY), so treat the output as sensitive. Needs administrator rights. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('EventDays?')
$Tags = @('forensics', 'triage', 'filesystem', 'event-logs')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
function Copy-File($src, $dst) {
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; return $true } catch { }
    $null = esentutl.exe /y $src /vss /d $dst 2>&1
    return (Test-Path -LiteralPath $dst)
}
function Note($what, $n, $mb) { [pscustomobject]@{ Artefact = $what; Files = $n; SizeMB = [math]::Round($mb / 1MB, 1) } }
function Copy-Tree($label, $srcRoot, $dstRel, $filter) {
    $n = 0; $b = 0
    foreach ($f in Get-ChildItem -LiteralPath $srcRoot -Recurse -File -Force) {
        if ($filter -and -not (& $filter $f)) { continue }
        $rel = $f.FullName.Substring($srcRoot.Length).TrimStart('\')
        if (Copy-File $f.FullName (Join-Path $OutDir "$dstRel\$rel")) { $n++; $b += $f.Length }
    }
    Note $label $n $b
}
$days = if ($EventDays -match '^\d+$') { [int]$EventDays } else { 7 }
Copy-Tree 'Prefetch' "$env:SystemRoot\Prefetch" 'Prefetch' $null
Copy-Tree 'Scheduled tasks' "$env:SystemRoot\System32\Tasks" 'Tasks' $null
Copy-Tree 'Hosts and network config' "$env:SystemRoot\System32\drivers\etc" 'Etc' $null
$reg = Join-Path $OutDir 'Registry'; New-Item -ItemType Directory -Path $reg -Force | Out-Null
$n = 0; foreach ($h in 'SYSTEM', 'SOFTWARE', 'SAM', 'SECURITY') { $d = Join-Path $reg $h; $null = reg save "HKLM\$h" $d /y 2>&1; if (-not (Test-Path $d)) { $null = esentutl.exe /y "$env:SystemRoot\System32\config\$h" /vss /d $d 2>&1 }; if (Test-Path $d) { $n++ } }
foreach ($ext in '', '.LOG1', '.LOG2') { if (Copy-File "$env:SystemRoot\AppCompat\Programs\Amcache.hve$ext" (Join-Path $reg "Amcache.hve$ext")) { $n++ } }
Note 'Machine registry hives and Amcache' $n 0
if (Copy-File "$env:SystemRoot\System32\sru\SRUDB.dat" (Join-Path $OutDir 'SRUM\SRUDB.dat')) { Note 'SRUM' 1 (Get-Item (Join-Path $OutDir 'SRUM\SRUDB.dat')).Length }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf; $n = 0
    foreach ($rel in 'NTUSER.DAT', 'AppData\Local\Microsoft\Windows\UsrClass.dat') { foreach ($ext in '', '.LOG1', '.LOG2') { $src = Join-Path $p.LocalPath "$rel$ext"; if (Test-Path -LiteralPath $src -Force) { if (Copy-File $src (Join-Path $OutDir "Users\$u\$(Split-Path "$rel$ext" -Leaf)")) { $n++ } } } }
    Note "User hives ($u)" $n 0
    Copy-Tree "Recent shortcuts and Jump Lists ($u)" "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\Recent" "Users\$u\Recent" $null
    $h = "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
    if (Test-Path -LiteralPath $h) { if (Copy-File $h (Join-Path $OutDir "Users\$u\ConsoleHost_history.txt")) { Note "PowerShell history ($u)" 1 (Get-Item -LiteralPath $h).Length } }
}
$since = (Get-Date).AddDays(-$days)
$evt = Join-Path $OutDir 'EventLogs'; New-Item -ItemType Directory -Path $evt -Force | Out-Null
foreach ($log in 'Security', 'System', 'Application', 'Microsoft-Windows-PowerShell/Operational', 'Microsoft-Windows-Sysmon/Operational', 'Microsoft-Windows-TaskScheduler/Operational', 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational', 'Microsoft-Windows-WinRM/Operational', 'Microsoft-Windows-Windows Defender/Operational') {
    $f = Join-Path $evt (($log -replace '[\\/:*?"<>|]', '%4') + '.evtx')
    $q = "*[System[TimeCreated[@SystemTime>='$($since.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z'))']]]"
    $null = wevtutil epl $log $f /q:$q /ow:true 2>&1
    if (Test-Path -LiteralPath $f) { Note "Event log: $log (last $days days)" 1 (Get-Item -LiteralPath $f).Length }
}
