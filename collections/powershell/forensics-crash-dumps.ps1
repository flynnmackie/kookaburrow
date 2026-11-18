$Name = 'Forensics - Crash Dumps and Minidumps'
$Description = 'Memory dump files on disk (MEMORY.DMP, minidumps, user-mode crash dumps). They can contain credentials and are a useful evidence source.'
$Dependencies = @()
$Tags = @('forensics', 'memory')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in "$env:SystemRoot\MEMORY.DMP", "$env:SystemRoot\Minidump", "$env:LOCALAPPDATA\CrashDumps", "$env:ProgramData\Microsoft\Windows\WER\Temp") { if (Test-Path $p) { Get-ChildItem $p -Recurse -File -Include *.dmp,*.mdmp,*.hdmp | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeMB = [math]::Round($_.Length / 1MB, 2); Created = $_.CreationTime; Modified = $_.LastWriteTime } } } }
