$Name = 'RDP - Outbound Connection History'
$Description = 'Remote Desktop servers this user connected to from this host (Terminal Server Client) and the user name used. Shows lateral movement paths.'
$Dependencies = @()
$Tags = @('rdp', 'lateral-movement', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) {
 $k = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Terminal Server Client\Servers"
 if (Test-Path $k) { Get-ChildItem $k | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ Sid = $root.PSChildName; Server = $_.PSChildName; UserNameHint = $p.UsernameHint } } } }
