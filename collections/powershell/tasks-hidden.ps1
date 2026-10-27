$Name = 'Tasks - Hidden'
$Description = 'Finds scheduled tasks that are hidden from the Task Scheduler. Needs administrator rights.'
$Dependencies = @()
$Tags = @('persistence', 'scheduled-tasks', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$tree = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache'
$files = @{}
Get-ChildItem "$env:SystemRoot\System32\Tasks" -Recurse -File -Force | ForEach-Object { $files[$_.FullName.Substring("$env:SystemRoot\System32\Tasks".Length).ToLower()] = $_ }
$seen = @{}
function Walk($key, $rel) {
    foreach ($k in Get-ChildItem $key) {
        $r = "$rel\$($k.PSChildName)"
        $p = Get-ItemProperty $k.PSPath
        if ($p.Id) {
            $seen[$r.ToLower()] = $true
            $path = "$env:SystemRoot\System32\Tasks$r"
            $why = @()
            $sev = 'Low'
            if (-not $p.SD) { $why += 'no security descriptor (hidden from the Task Scheduler)'; $sev = 'HIGH' }
            if (-not (Test-Path -LiteralPath $path)) { $why += 'definition file missing' }
            $act = (Get-ItemProperty "$tree\Tasks\$($p.Id)").Actions
            if ($why) { [pscustomobject]@{ Severity = $sev; Task = $r; Problem = ($why -join '; '); Id = $p.Id; Index = $p.Index; ActionsBytes = @($act).Count } }
        }
        Walk $k.PSPath $r
    }
}
Walk "$tree\Tree" ''
foreach ($f in $files.Keys) { if (-not $seen.ContainsKey($f)) { [pscustomobject]@{ Severity = 'HIGH'; Task = $f; Problem = 'task file exists but the task is not registered in the registry'; Id = ''; Index = ''; ActionsBytes = '' } } }
