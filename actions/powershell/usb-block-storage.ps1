$Name = 'USB - Block Storage'
$Description = 'Stops the host mounting USB storage devices (flash drives and external disks) by disabling the USBSTOR driver, to prevent data theft and malware delivery.'
$Dependencies = @()
$Tags = @('containment', 'hardening', 'usb')

$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR'
$old = (Get-ItemProperty -LiteralPath $k).Start
Set-ItemProperty -LiteralPath $k -Name Start -Value 4 -Type DWord -ErrorAction Stop
Write-Output "USBSTOR Start set to 4 (disabled). Previous value: $old"
