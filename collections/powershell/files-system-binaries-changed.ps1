$Name = 'Files - Recently Modified System Binaries'
$Description = 'Programs and libraries in System32 modified in the last days (default 14) with their signature. System files should only change with patching.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('filesystem', 'defense-evasion', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$d = if ($Days) { [int]$Days } else { 14 }
Get-ChildItem "$env:SystemRoot\System32" -File -Include *.exe,*.dll,*.sys | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-$d) } | Select-Object -First 400 | ForEach-Object { $s = Get-AuthenticodeSignature -LiteralPath $_.FullName; [pscustomobject]@{ Path = $_.FullName; Modified = $_.LastWriteTime; Created = $_.CreationTime; SizeKB = [math]::Round($_.Length / 1KB); Signature = "$($s.Status)"; Signer = $s.SignerCertificate.Subject } }
