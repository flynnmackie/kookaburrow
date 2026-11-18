$Name = 'SMB - Shares and Sessions'
$Description = 'Shows the shares this host exposes, who is connected to them right now, and the SMB connections and drive mappings this host has made outward.'
$Dependencies = @()
$Tags = @('lateral-movement', 'network', 'smb', 'discovery')
$DiffIgnore = @('Detail')

$ErrorActionPreference = 'SilentlyContinue'

# One row per share, inbound session, file open over SMB, outbound connection and mapped drive (Kind says which). Detail holds what
# changes by itself (open-file counts, session age, dialect, mapping status) and is not compared. Sessions need administrator rights.
function Row($kind, $name, $path, $user, $remote, $detail) { [pscustomobject]@{ Kind = $kind; Name = "$name"; Path = "$path"; User = "$user"; Remote = "$remote"; Detail = "$detail" } }

Get-SmbShare | ForEach-Object { Row 'Share' $_.Name $_.Path '' '' "$($_.Description)$(if ($_.Special) { ' (special)' })" }
Get-SmbSession | ForEach-Object { Row 'Inbound session' '' '' $_.ClientUserName $_.ClientComputerName "$($_.NumOpens) open, $($_.SecondsExists)s" }
Get-SmbOpenFile | ForEach-Object { Row 'Open file' '' $_.Path $_.ClientUserName $_.ClientComputerName '' }
Get-SmbConnection | ForEach-Object { Row 'Outbound connection' $_.ShareName '' $_.UserName $_.ServerName "$($_.Dialect) $($_.Credential)" }
Get-SmbMapping | ForEach-Object { Row 'Mapped drive' $_.LocalPath '' '' $_.RemotePath "$($_.Status)" }
