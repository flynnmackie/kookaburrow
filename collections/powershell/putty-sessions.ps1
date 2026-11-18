$Name = 'SSH - PuTTY Sessions and Host Keys'
$Description = 'Saved PuTTY sessions and the SSH host keys it has accepted, for every logged-on user. Shows which servers a user connects to.'
$Dependencies = @()
$Tags = @('ssh', 'lateral-movement', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $b = "Registry::HKEY_USERS\$($root.PSChildName)\Software\SimonTatham\PuTTY"
 Get-ChildItem "$b\Sessions" | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ Sid = $root.PSChildName; Kind = 'Session'; Name = [uri]::UnescapeDataString($_.PSChildName); Host = $p.HostName; Port = $p.PortNumber; User = $p.UserName; Key = $p.PublicKeyFile } }
 $h = Get-ItemProperty "$b\SshHostKeys"; foreach ($n in ($h.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { [pscustomobject]@{ Sid = $root.PSChildName; Kind = 'HostKey'; Name = $n.Name; Host = ''; Port = ''; User = ''; Key = '' } } }
