$Name = 'Forensics - Windows Error Reporting Crashes'
$Description = 'Application crash reports (faulting program, module, exception and time). Crashes of security tools, or of programs an attacker exploited, show up here.'
$Dependencies = @()
$Tags = @('forensics', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($d in "$env:ProgramData\Microsoft\Windows\WER\ReportArchive", "$env:ProgramData\Microsoft\Windows\WER\ReportQueue") { Get-ChildItem $d -Directory | ForEach-Object { $r = Join-Path $_.FullName 'Report.wer'; if (Test-Path $r) { $c = Get-Content $r -Encoding Unicode; $g = { param($n) (($c | Where-Object { $_ -match "^$n=" } | Select-Object -First 1) -replace "^$n=", '') }; [pscustomobject]@{ Time = $_.LastWriteTime; EventType = (& $g 'EventType'); Application = (& $g 'AppName'); AppPath = (& $g 'AppPath'); Module = (& $g 'Sig[3].Value'); Exception = (& $g 'Sig[6].Value') } } } }
