$Name = 'System - Drivers'
$Description = 'Kernel and file system drivers with path, state, start type and signature status. Rootkits and vulnerable-driver (BYOVD) attacks load drivers, so look for unsigned drivers or ones outside System32\drivers (like Windows.System.Drivers).'
$Dependencies = @()
$Tags = @('persistence', 'defense-evasion', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_SystemDriver | ForEach-Object {
    $path = ($_.PathName -replace '^\\\?\?\\', '' -replace '^"|"$', '' -replace '^\\SystemRoot', $env:SystemRoot)
    $sig = if ($path -and (Test-Path -LiteralPath $path)) { Get-AuthenticodeSignature -LiteralPath $path } else { $null }
    [pscustomobject]@{ Name = $_.Name; Display = $_.DisplayName; State = $_.State; Start = $_.StartMode; Path = $path; Signature = $sig.Status; Signer = $sig.SignerCertificate.Subject; Company = (Get-Item -LiteralPath $path).VersionInfo.CompanyName }
} | Sort-Object @{ Expression = { $_.Signature -eq 'Valid' } }, Name
