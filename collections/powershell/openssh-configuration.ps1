$Name = 'SSH - OpenSSH Server on Windows'
$Description = 'Whether the OpenSSH server is installed and running, its listening configuration, and the authorized keys files for administrators.'
$Dependencies = @()
$Tags = @('ssh', 'persistence', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
$s = Get-Service sshd
[pscustomobject]@{ Item = 'Service sshd'; Value = if ($s) { "$($s.Status) / $($s.StartType)" } else { 'not installed' } }
$c = Join-Path $env:ProgramData 'ssh\sshd_config'
if (Test-Path $c) { Get-Content $c | Where-Object { $_ -match '^\s*[A-Za-z]' } | ForEach-Object { [pscustomobject]@{ Item = 'sshd_config'; Value = $_.Trim() } } }
foreach ($f in (Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'), "$env:USERPROFILE\.ssh\authorized_keys") { if (Test-Path $f) { Get-Content $f | Where-Object { $_ -match '^(ssh|ecdsa)' } | ForEach-Object { [pscustomobject]@{ Item = "key in $f"; Value = ($_ -replace '^(\S+\s+)(\S{20})\S*(.*)$', '$1$2...$3') } } } }
