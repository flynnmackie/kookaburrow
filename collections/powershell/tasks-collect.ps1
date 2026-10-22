$Name = 'Tasks - Collect'
$Description = 'Copies the scheduled task definitions: every XML file under C:\Windows\System32\Tasks (the full task folder tree) and any legacy .job files in C:\Windows\Tasks. The XML holds the exact command, arguments, triggers and author of each task, including ones that have been hidden from the Task Scheduler. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Tags = @('persistence', 'scheduled-tasks', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$root = "$env:SystemRoot\System32\Tasks"
foreach ($f in Get-ChildItem -LiteralPath $root -Recurse -File -Force) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $dst = Join-Path $OutDir "Tasks\$rel"
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    [pscustomobject]@{ Task = $rel; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
}
foreach ($f in Get-ChildItem -LiteralPath "$env:SystemRoot\Tasks" -Filter '*.job' -File -Force) {
    $dst = Join-Path $OutDir "LegacyTasks\$($f.Name)"
    New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    [pscustomobject]@{ Task = "legacy\$($f.Name)"; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
}
