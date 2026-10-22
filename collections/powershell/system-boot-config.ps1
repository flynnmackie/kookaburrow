$Name = 'System - Boot Configuration'
$Description = 'Boot and platform security configuration: the boot configuration store (bcdedit: test signing, debug mode, safe boot, boot status policy, recovery), Secure Boot state, firmware type, TPM presence and BitLocker status. Test signing and debug mode allow unsigned or hostile drivers; a disabled Secure Boot or recovery environment is a bootkit and ransomware enabler.'
$Dependencies = @()
$Tags = @('inventory', 'defense-evasion', 'persistence', 'security')

$ErrorActionPreference = 'SilentlyContinue'
function Row($setting, $value) { [pscustomobject]@{ Setting = $setting; Value = $value } }
Row 'Secure Boot enabled' $(try { Confirm-SecureBootUEFI } catch { 'not supported (legacy BIOS) or not available' })
Row 'Firmware type' $(if ($env:firmware_type) { $env:firmware_type } else { (Get-ComputerInfo -Property BiosFirmwareType).BiosFirmwareType })
$t = Get-Tpm
Row 'TPM present / ready' "$($t.TpmPresent) / $($t.TpmReady)"
foreach ($v in Get-BitLockerVolume) { Row "BitLocker $($v.MountPoint)" "$($v.VolumeStatus) protection=$($v.ProtectionStatus) method=$($v.EncryptionMethod)" }
foreach ($l in (bcdedit /enum '{current}') + (bcdedit /enum '{bootmgr}')) { if ($l -match '^(\S+)\s{2,}(.+)$') { Row "bcdedit: $($Matches[1])" $Matches[2] } }
Row 'Recovery environment' ((reagentc /info | Select-String 'Windows RE status') -replace '\s+', ' ')
