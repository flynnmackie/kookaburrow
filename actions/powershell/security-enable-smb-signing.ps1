$Name = 'Security - Require SMB Signing'
$Description = 'Requires SMB signing on both the SMB server and client of this host, which stops SMB relay attacks (NTLM relay to SMB).'
$Dependencies = @()
$Tags = @('hardening', 'smb', 'lateral-movement')

$b = Get-SmbServerConfiguration
Set-SmbServerConfiguration -RequireSecuritySignature $true -EnableSecuritySignature $true -Force -ErrorAction Stop
Set-SmbClientConfiguration -RequireSecuritySignature $true -EnableSecuritySignature $true -Force -ErrorAction Stop
Write-Output "SMB server signing required: was $($b.RequireSecuritySignature), now $((Get-SmbServerConfiguration).RequireSecuritySignature)"
Write-Output "SMB client signing required: now $((Get-SmbClientConfiguration).RequireSecuritySignature)"
