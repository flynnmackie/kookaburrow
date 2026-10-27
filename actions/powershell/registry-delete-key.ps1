$Name = 'Registry - Delete Key'
$Description = 'Deletes a registry key and everything under it.'
$Dependencies = @()
$Parameters = @('KeyPath')
$Tags = @('registry', 'persistence', 'remediation')

if ($KeyPath -notmatch '^(HKLM:|HKCU:|Registry::HKEY_(LOCAL_MACHINE|USERS|CURRENT_USER))') { throw 'KeyPath must start with HKLM:, HKCU: or Registry::HKEY_USERS' }
$depth = ($KeyPath -replace '^[^\\]*\\?', '' -split '\\' | Where-Object { $_ }).Count
if ($depth -lt 3) { throw 'Refusing to delete a key this close to the top of the registry (at least 3 levels deep are required)' }
if ($KeyPath -match '(?i)\\(SYSTEM\\CurrentControlSet\\(Services|Control)|SOFTWARE\\Microsoft\\Windows( NT)?\\CurrentVersion)\\?$') { throw 'Refusing to delete a core system key' }
$k = Get-Item -LiteralPath $KeyPath -ErrorAction Stop
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$reg = Join-Path $dir ('{0:yyyyMMdd-HHmmss}_registry_{1}.reg' -f (Get-Date), (($k.Name -replace '[\\/:*?"<>|]', '_')))
$null = reg.exe export $k.Name $reg /y 2>&1
if (-not (Test-Path -LiteralPath $reg)) { throw 'Could not back up the key, so it was not deleted' }
$subs = $k.SubKeyCount; $vals = $k.ValueCount; $name = $k.Name
Remove-Item -LiteralPath $KeyPath -Recurse -Force -ErrorAction Stop
Write-Output "Deleted key $name ($subs subkeys, $vals values)"
Write-Output "Key backup: $reg"
