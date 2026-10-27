$Name = 'Deploy - Elastic Agent (Windows)'
$Description = 'Installs the Elastic Agent on the host and enrols it in your Fleet Server. Needs administrator rights.'
$Dependencies = @('elastic-agent-windows.zip')
$Parameters = @('FleetUrl', 'EnrollmentToken', 'Insecure?')
$Tags = @('deploy', 'elastic', 'agent', 'persistence')

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'This needs an elevated session: the account Kookaburrow uses must be a local administrator' }
if ($FleetUrl -notmatch '^https?://[A-Za-z0-9.\-_\[\]:]+(/[A-Za-z0-9._~/%\-]*)?$') { throw 'FleetUrl must look like https://fleet.example.com:8220' }
if ($EnrollmentToken -notmatch '^[A-Za-z0-9+/=_:\-]{8,}$') { throw 'EnrollmentToken contains characters a Fleet enrollment token does not use' }
$zip = Join-Path $BinDir 'elastic-agent-windows.zip'
if (-not (Test-Path -LiteralPath $zip)) { throw 'elastic-agent-windows.zip was not staged on the host' }

$existing = Get-Service -Name 'Elastic Agent*', 'elastic-agent*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) { Write-Output "An Elastic Agent service is already installed ($($existing.Name), $($existing.Status)). Nothing was changed."; return }

Write-Output ('Package: elastic-agent-windows.zip, SHA-256 ' + (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower())
$dir = Join-Path $BinDir 'elastic'
Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
$agent = Get-ChildItem -LiteralPath $dir -Recurse -Filter 'elastic-agent.exe' -File | Select-Object -First 1
if (-not $agent) { throw 'elastic-agent-windows.zip does not contain elastic-agent.exe' }

$a = @('install', "--url=$FleetUrl", "--enrollment-token=$EnrollmentToken", '--non-interactive')
if ($Insecure -match '^(yes|true|1)$') { $a += '--insecure'; Write-Output 'Insecure is on: the Fleet Server certificate is not verified' }
$out = Join-Path $BinDir 'agent-install.txt'
$err = Join-Path $BinDir 'agent-install-err.txt'
$p = Start-Process -FilePath $agent.FullName -ArgumentList $a -WorkingDirectory $agent.DirectoryName -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
foreach ($f in $out, $err) { if (Test-Path -LiteralPath $f) { Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Where-Object { $_.Trim() } | ForEach-Object { Write-Output ($_.Replace($EnrollmentToken, '********')) } } }
Write-Output "Elastic Agent installer exit code: $($p.ExitCode)"

$svc = $null
for ($i = 0; $i -lt 12; $i++) {
    $svc = Get-Service -Name 'Elastic Agent*', 'elastic-agent*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($svc -and $svc.Status -eq 'Running') { break }
    Start-Sleep -Seconds 5
}
if (-not ($svc -and $svc.Status -eq 'Running')) { throw "The Elastic Agent is not running afterwards (service: $(if ($svc) { $svc.Status } else { 'not found' }), installer exit code $($p.ExitCode))" }
Write-Output "Elastic Agent is installed and running (service $($svc.Name)), enrolling with $FleetUrl"
