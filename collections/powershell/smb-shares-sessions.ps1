$Name = 'SMB shares, sessions and mapped drives'
$Description = 'Shows the shares this host exposes, who is connected to them right now, and the SMB connections and drive mappings this host has made outward. Useful for spotting lateral movement over SMB and unexpected shares.'
$Dependencies = @()
$Tags = @('lateral-movement', 'network', 'smb', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'

'== Shares exposed by this host =='
Get-SmbShare | Select-Object Name, Path, Description, @{ n = 'Special'; e = { $_.Special } } | Format-Table -AutoSize

'== Inbound SMB sessions (who is connected now) =='
$sess = Get-SmbSession
if ($sess) { $sess | Select-Object ClientComputerName, ClientUserName, NumOpens, SecondsExists | Format-Table -AutoSize } else { '(none, or administrator rights needed)' }

'== Open files over SMB =='
$open = Get-SmbOpenFile
if ($open) { $open | Select-Object ClientComputerName, ClientUserName, Path | Format-Table -AutoSize } else { '(none)' }

'== Outbound SMB connections from this host =='
$conn = Get-SmbConnection
if ($conn) { $conn | Select-Object ServerName, ShareName, UserName, Credential, Dialect | Format-Table -AutoSize } else { '(none)' }

'== Mapped drives =='
$map = Get-SmbMapping
if ($map) { $map | Select-Object LocalPath, RemotePath, Status | Format-Table -AutoSize } else { '(none)' }
