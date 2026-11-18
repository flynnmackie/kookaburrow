$Name = 'Files - Password Stores and Key Files'
$Description = 'Password manager databases, SSH keys, certificates with private keys, RDP files and VPN profiles found in user folders.'
$Dependencies = @()
$Tags = @('filesystem', 'accounts', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($u in (Get-ChildItem "$env:SystemDrive\Users" -Directory)) { Get-ChildItem $u.FullName -Recurse -Force -File -Depth 5 -Include *.kdbx,*.kdb,*.pfx,*.p12,*.ppk,*.pem,id_rsa,id_ed25519,*.rdp,*.ovpn,*.1pux,*.opvault,known_hosts,authorized_keys | Select-Object -First 200 | ForEach-Object { [pscustomobject]@{ User = $u.Name; Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB, 1); Modified = $_.LastWriteTime } } }
