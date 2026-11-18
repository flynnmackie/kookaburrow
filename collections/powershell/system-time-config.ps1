$Name = 'System - Time Service Configuration'
$Description = 'Time zone, time source and the Windows Time providers. Changed time sources and providers are used to hide activity or load a DLL.'
$Dependencies = @()
$Tags = @('system', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
$tz = Get-TimeZone
[pscustomobject]@{ Setting = 'TimeZone'; Value = $tz.Id }
$w = w32tm /query /configuration 2>&1 | Out-String
foreach ($m in [regex]::Matches($w, '(?m)^(Type|NtpServer|DllName|Enabled|InputProvider):\s*(.+?)\s*(\(.*\))?$')) { [pscustomobject]@{ Setting = $m.Groups[1].Value; Value = $m.Groups[2].Value } }
