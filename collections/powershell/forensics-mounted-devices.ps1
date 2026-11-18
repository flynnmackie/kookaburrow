$Name = 'Forensics - Mounted Devices and Drive Letters'
$Description = 'Volumes the system has assigned a drive letter to, including removable media that is no longer attached.'
$Dependencies = @()
$Tags = @('forensics', 'inventory', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
$k = Get-ItemProperty 'HKLM:\SYSTEM\MountedDevices'
foreach ($n in ($k.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { $v = $n.Value; $txt = if ($v.Length -gt 12) { ([Text.Encoding]::Unicode.GetString($v) -replace '[^\x20-\x7E]', '').Trim() } else { ('{0:X}' -f [BitConverter]::ToUInt32($v, 0)) }; [pscustomobject]@{ Mount = $n.Name; Identifier = $txt } }
