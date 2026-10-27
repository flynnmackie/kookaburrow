$Name = 'Deploy - Sysmon (Windows)'
$Description = 'Installs Sysmon on the host as a service with your own configuration file (Sysmon64.exe -accepteula -i config). Needs administrator rights.'
$Dependencies = @('Sysmon64.exe', 'sysmon-config.xml')
$Parameters = @()
$Tags = @('deploy', 'sysmon', 'logging', 'persistence')

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'This needs an elevated session: the account Kookaburrow uses must be a local administrator' }
if (-not [Environment]::Is64BitOperatingSystem) { throw 'This deploys Sysmon64.exe, which needs a 64-bit Windows host' }
$exe = Join-Path $BinDir 'Sysmon64.exe'
$cfg = Join-Path $BinDir 'sysmon-config.xml'
foreach ($f in $exe, $cfg) { if (-not (Test-Path -LiteralPath $f)) { throw "$(Split-Path $f -Leaf) was not staged on the host" } }

$existing = Get-Service -Name 'Sysmon*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) { Write-Output "A Sysmon service is already installed ($($existing.Name), $($existing.Status)). Nothing was changed."; return }

try { $xml = New-Object System.Xml.XmlDocument; $xml.Load($cfg) } catch { throw "sysmon-config.xml is not valid XML: $($_.Exception.Message)" }
if ($xml.DocumentElement.Name -ne 'Sysmon') { throw 'sysmon-config.xml is not a Sysmon configuration (the root element must be <Sysmon>)' }
Write-Output ('Sysmon64.exe SHA-256 ' + (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower())
Write-Output ('Configuration SHA-256 ' + (Get-FileHash -LiteralPath $cfg -Algorithm SHA256).Hash.ToLower() + ", schema version $($xml.DocumentElement.GetAttribute('schemaversion'))")

$out = Join-Path $BinDir 'sysmon-install.txt'
$err = Join-Path $BinDir 'sysmon-install-err.txt'
$p = Start-Process -FilePath $exe -ArgumentList '-accepteula', '-i', ('"' + $cfg + '"') -Wait -PassThru -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err
foreach ($f in $out, $err) { if (Test-Path -LiteralPath $f) { Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Where-Object { $_.Trim() } | ForEach-Object { Write-Output $_ } } }
Write-Output "Sysmon installer exit code: $($p.ExitCode)"

$svc = $null
for ($i = 0; $i -lt 6; $i++) {
    $svc = Get-Service -Name 'Sysmon*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($svc -and $svc.Status -eq 'Running') { break }
    Start-Sleep -Seconds 2
}
if (-not ($svc -and $svc.Status -eq 'Running')) { throw "Sysmon is not running afterwards (service: $(if ($svc) { $svc.Status } else { 'not found' }))" }
Write-Output "Sysmon is installed and running (service $($svc.Name))"
