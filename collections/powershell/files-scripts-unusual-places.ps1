$Name = 'Files - Scripts in Unusual Places'
$Description = 'Script files (ps1, vbs, js, bat, cmd, hta, wsf) in ProgramData, Temp, Public, the Windows folder and the recycle bin, where administrators rarely keep them.'
$Dependencies = @()
$Tags = @('filesystem', 'execution', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$roots = "$env:ProgramData", "$env:SystemRoot\Temp", "$env:SystemDrive\Users\Public", "$env:SystemRoot\Tasks", "$env:SystemRoot\debug", "$env:SystemDrive\`$Recycle.Bin", "$env:SystemDrive\PerfLogs"
foreach ($r in $roots) { if (Test-Path $r) { Get-ChildItem $r -Recurse -File -Include *.ps1,*.vbs,*.vbe,*.js,*.jse,*.bat,*.cmd,*.hta,*.wsf -Depth 5 | Select-Object -First 300 | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB, 1); Created = $_.CreationTime; Modified = $_.LastWriteTime } } } }
