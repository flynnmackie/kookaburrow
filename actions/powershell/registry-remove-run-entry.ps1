$Name = 'Persistence - Remove Run Entry'
$Description = 'Removes one entry from a Run or RunOnce key.'
$Dependencies = @()
$Parameters = @('Hive', 'EntryName', 'Key?')
$Tags = @('persistence', 'registry', 'remediation')

$root = switch ($Hive.ToUpper()) { 'HKLM' { 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion' } 'HKLM32' { 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion' } 'HKCU' { 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion' } default { throw 'Hive must be HKLM, HKLM32 or HKCU' } }
$kind = if ($Key) { $Key } else { 'Run' }
if ($kind -notin 'Run', 'RunOnce') { throw 'Key must be Run or RunOnce' }
if (-not $EntryName) { throw 'EntryName is required' }
$path = "$root\$kind"
$k = Get-Item -LiteralPath $path -ErrorAction Stop
if ($EntryName -notin $k.GetValueNames()) { throw "No entry named $EntryName under $path" }
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$reg = Join-Path $dir ('{0:yyyyMMdd-HHmmss}_run_{1}.reg' -f (Get-Date), $Hive)
$null = reg.exe export $k.Name $reg /y 2>&1
$old = $k.GetValue($EntryName)
Remove-ItemProperty -LiteralPath $path -Name $EntryName -ErrorAction Stop
Write-Output "Removed $EntryName from $($k.Name) (was: $old)"
Write-Output "Key backup: $reg"
