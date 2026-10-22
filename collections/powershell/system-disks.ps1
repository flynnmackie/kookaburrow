$Name = 'System - Disks and Volumes'
$Description = 'Physical disks, volumes with file system, size and free space, and BitLocker state. Shows removable and network drives and how much room there is for an acquisition (like Windows.Sys.Drives).'
$Dependencies = @()
$Tags = @('inventory', 'filesystem')

$ErrorActionPreference = 'SilentlyContinue'
Get-Volume | ForEach-Object {
    [pscustomobject]@{ Type = 'Volume'; Drive = $_.DriveLetter; Label = $_.FileSystemLabel; FileSystem = $_.FileSystem; DriveType = $_.DriveType; SizeGB = [math]::Round($_.Size / 1GB, 1); FreeGB = [math]::Round($_.SizeRemaining / 1GB, 1); Health = $_.HealthStatus }
}
Get-PhysicalDisk | ForEach-Object {
    [pscustomobject]@{ Type = 'Disk'; Drive = $_.DeviceId; Label = $_.FriendlyName; FileSystem = $_.MediaType; DriveType = $_.BusType; SizeGB = [math]::Round($_.Size / 1GB, 1); FreeGB = ''; Health = $_.HealthStatus }
}
Get-CimInstance Win32_EncryptableVolume -Namespace 'root\CIMV2\Security\MicrosoftVolumeEncryption' | ForEach-Object {
    [pscustomobject]@{ Type = 'BitLocker'; Drive = $_.DriveLetter; Label = ''; FileSystem = ''; DriveType = ''; SizeGB = ''; FreeGB = ''; Health = "ProtectionStatus=$($_.ProtectionStatus)" }
}
