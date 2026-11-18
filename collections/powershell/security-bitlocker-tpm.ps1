$Name = 'Security - BitLocker and TPM'
$Description = 'BitLocker protection status for every volume and the TPM state. Unencrypted disks and a missing TPM matter when a laptop is lost or an image is taken.'
$Dependencies = @()
$Tags = @('security', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
Get-BitLockerVolume | ForEach-Object { [pscustomobject]@{ Volume = $_.MountPoint; Protection = "$($_.ProtectionStatus)"; Encryption = "$($_.EncryptionMethod)"; Percent = $_.EncryptionPercentage; KeyProtectors = (($_.KeyProtector | ForEach-Object { "$($_.KeyProtectorType)" }) -join ', ') } }
$t = Get-Tpm
[pscustomobject]@{ Volume = '(TPM)'; Protection = "present $($t.TpmPresent), ready $($t.TpmReady)"; Encryption = ''; Percent = ''; KeyProtectors = '' }
