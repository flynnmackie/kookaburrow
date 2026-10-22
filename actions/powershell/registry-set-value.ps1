$Name = 'Registry - Set Value'
$Description = 'Sets a registry value, creating the key if needed. KeyPath is the PowerShell path (for example HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging). ValueType is String (default), ExpandString, DWord, QWord or MultiString. The previous value is reported. Use it for hardening and to restore a setting.'
$Dependencies = @()
$Parameters = @('KeyPath', 'ValueName', 'ValueData', 'ValueType?')
$Tags = @('registry', 'remediation', 'hardening')

if ($KeyPath -notmatch '^(HKLM:|HKCU:|Registry::HKEY_(LOCAL_MACHINE|USERS|CURRENT_USER))') { throw 'KeyPath must start with HKLM:, HKCU: or Registry::HKEY_USERS' }
$type = if ($ValueType) { $ValueType } else { 'String' }
if ($type -notin 'String', 'ExpandString', 'DWord', 'QWord', 'MultiString') { throw 'ValueType must be String, ExpandString, DWord, QWord or MultiString' }
$data = switch ($type) { 'DWord' { [int]$ValueData } 'QWord' { [int64]$ValueData } 'MultiString' { @($ValueData -split '\|') } default { [string]$ValueData } }
if (-not (Test-Path -LiteralPath $KeyPath)) { New-Item -Path $KeyPath -Force | Out-Null; Write-Output "Created key $KeyPath" }
$old = (Get-ItemProperty -LiteralPath $KeyPath -Name $ValueName -ErrorAction SilentlyContinue).$ValueName
Set-ItemProperty -LiteralPath $KeyPath -Name $ValueName -Value $data -Type $type -ErrorAction Stop 2>$null
if (-not $?) { New-ItemProperty -LiteralPath $KeyPath -Name $ValueName -Value $data -PropertyType $type -Force | Out-Null }
Write-Output "Set $KeyPath : $ValueName = $ValueData ($type). Previous value: $(if ($null -eq $old) { '(none)' } else { $old })"
