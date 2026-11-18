$Name = 'Files - Executables in User Profiles'
$Description = 'Programs, DLLs and scripts stored in user profile folders (AppData, Downloads, Desktop, Documents), where users and malware can write. Lists the newest first.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('filesystem', 'malware', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$d = if ($Days) { [int]$Days } else { 30 }
foreach ($u in (Get-ChildItem "$env:SystemDrive\Users" -Directory)) { foreach ($sub in 'AppData\Local', 'AppData\Roaming', 'Downloads', 'Desktop', 'Documents') { $p = Join-Path $u.FullName $sub; if (Test-Path $p) { Get-ChildItem $p -Recurse -File -Include *.exe,*.dll,*.scr,*.ps1,*.vbs,*.js,*.bat,*.cmd,*.hta,*.jar -Depth 4 | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-$d) } | Select-Object -First 400 | ForEach-Object { [pscustomobject]@{ User = $u.Name; Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB); Created = $_.CreationTime; Modified = $_.LastWriteTime } } } } }
