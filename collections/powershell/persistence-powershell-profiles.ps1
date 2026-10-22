$Name = 'Persistence - PowerShell Profiles'
$Description = 'PowerShell profile scripts for all users and every user profile (Windows PowerShell and PowerShell 7, console and ISE). A profile runs at every shell start, so a modified one is persistence; the first lines and hash are shown.'
$Dependencies = @()
$Tags = @('persistence', 'powershell', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$files = @("$PSHOME\profile.ps1", "$PSHOME\Microsoft.PowerShell_profile.ps1", "$PSHOME\Microsoft.PowerShellISE_profile.ps1", "$env:ProgramFiles\PowerShell\7\profile.ps1", "$env:ProgramFiles\PowerShell\7\Microsoft.PowerShell_profile.ps1")
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    foreach ($rel in 'Documents\WindowsPowerShell\profile.ps1', 'Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1', 'Documents\WindowsPowerShell\Microsoft.PowerShellISE_profile.ps1', 'Documents\PowerShell\profile.ps1', 'Documents\PowerShell\Microsoft.PowerShell_profile.ps1') { $files += Join-Path $p.LocalPath $rel }
}
foreach ($f in $files) {
    $i = Get-Item -LiteralPath $f -Force
    if (-not $i) { continue }
    $first = (Get-Content -LiteralPath $f -TotalCount 5) -join ' | '
    [pscustomobject]@{ Path = $f; SizeBytes = $i.Length; Created = $i.CreationTime; Modified = $i.LastWriteTime; Sha256 = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash; Start = $first.Substring(0, [Math]::Min(300, $first.Length)) }
}
