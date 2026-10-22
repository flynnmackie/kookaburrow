$Name = 'Registry - Delete Value'
$Description = 'Deletes one registry value. The key is exported to C:\ProgramData\Kookaburrow\Quarantine as a .reg file first so the value can be restored. KeyPath is the PowerShell path (for example HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run); ValueName is the value to remove.'
$Dependencies = @()
$Parameters = @('KeyPath', 'ValueName')
$Tags = @('registry', 'persistence', 'remediation')

if ($KeyPath -notmatch '^(HKLM:|HKCU:|Registry::HKEY_(LOCAL_MACHINE|USERS|CURRENT_USER))') { throw 'KeyPath must start with HKLM:, HKCU: or Registry::HKEY_USERS' }
if (-not $ValueName) { throw 'ValueName is required' }
$k = Get-Item -LiteralPath $KeyPath -ErrorAction Stop
if ($ValueName -notin $k.GetValueNames()) { throw "The value $ValueName does not exist under $KeyPath" }
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$reg = Join-Path $dir ('{0:yyyyMMdd-HHmmss}_registry_{1}.reg' -f (Get-Date), (($k.Name -replace '[\\/:*?"<>|]', '_')))
$null = reg.exe export $k.Name $reg /y 2>&1
$old = $k.GetValue($ValueName)
Remove-ItemProperty -LiteralPath $KeyPath -Name $ValueName -ErrorAction Stop
Write-Output "Deleted value $ValueName from $($k.Name) (was: $old)"
Write-Output "Key backup: $reg"
