$Name = 'Defender - Update Signatures'
$Description = 'Updates Microsoft Defender antimalware signatures now and reports the signature version before and after. Run it before a scan so new detections are available.'
$Dependencies = @()
$Tags = @('antivirus', 'recovery')

$before = (Get-MpComputerStatus).AntivirusSignatureVersion
Update-MpSignature -ErrorAction Stop
$s = Get-MpComputerStatus
Write-Output "Signatures: $before -> $($s.AntivirusSignatureVersion) (last updated $($s.AntivirusSignatureLastUpdated))"
