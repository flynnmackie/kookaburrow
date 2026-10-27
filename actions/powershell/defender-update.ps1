$Name = 'Defender - Update Signatures'
$Description = 'Updates Microsoft Defender antimalware signatures now and reports the signature version before and after.'
$Dependencies = @()
$Tags = @('antivirus', 'recovery')

$before = (Get-MpComputerStatus).AntivirusSignatureVersion
Update-MpSignature -ErrorAction Stop
$s = Get-MpComputerStatus
Write-Output "Signatures: $before -> $($s.AntivirusSignatureVersion) (last updated $($s.AntivirusSignatureLastUpdated))"
