$Name = 'Files - Recently Created Programs'
$Description = 'Executables and libraries created in the last days (default 7) in System32, SysWOW64 and Program Files, with their signature. New programs outside patching are worth a look.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('filesystem', 'execution', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$d = if ($Days) { [int]$Days } else { 7 }
foreach ($r in "$env:SystemRoot\System32", "$env:SystemRoot\SysWOW64", $env:ProgramFiles, $([Environment]::GetEnvironmentVariable("ProgramFiles(x86)"))) { if ($r -and (Test-Path $r)) { Get-ChildItem $r -File -Recurse -Depth 1 -Include *.exe,*.dll,*.sys,*.scr | Where-Object { $_.CreationTime -gt (Get-Date).AddDays(-$d) } | Select-Object -First 60 | ForEach-Object { $s = Get-AuthenticodeSignature -LiteralPath $_.FullName; [pscustomobject]@{ Path = $_.FullName; Created = $_.CreationTime; SizeKB = [math]::Round($_.Length / 1KB); Signature = "$($s.Status)"; Signer = $s.SignerCertificate.Subject } } } }
