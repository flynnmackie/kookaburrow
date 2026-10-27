$Name = 'SMB - Disable SMBv1'
$Description = 'Disables the legacy SMBv1 protocol on the SMB server (the one exploited by EternalBlue and used by worms) and turns off the client feature where possible.'
$Dependencies = @()
$Tags = @('hardening', 'smb', 'network')

$before = (Get-SmbServerConfiguration).EnableSMB1Protocol
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction Stop
Write-Output "SMBv1 server protocol was $before, now $((Get-SmbServerConfiguration).EnableSMB1Protocol)"
$f = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue
if ($f -and $f.State -eq 'Enabled') { Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -ErrorAction SilentlyContinue | Out-Null; Write-Output 'SMB1Protocol feature disabled (takes full effect after a restart).' }
