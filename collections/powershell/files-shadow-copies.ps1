$Name = 'Files - Shadow Copies'
$Description = 'Volume shadow copies on the host with creation time, volume and device path. Attackers delete shadow copies before ransomware; an unexpected empty list on a server that normally has them, or a very recent single copy, matters. Existing copies are also a source of older file versions.'
$Dependencies = @()
$Tags = @('filesystem', 'forensics', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$c = @(Get-CimInstance Win32_ShadowCopy)
if (-not $c) { 'No volume shadow copies.'; return }
$c | Sort-Object InstallDate -Descending | ForEach-Object { [pscustomobject]@{ Id = $_.ID; Created = $_.InstallDate; Volume = $_.VolumeName; DevicePath = $_.DeviceObject; ClientAccessible = $_.ClientAccessible; Persistent = $_.Persistent; Provider = $_.ProviderID } }
