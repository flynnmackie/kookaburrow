$Name = 'USB - Allow Storage'
$Description = 'Re-enables USB storage devices by setting the USBSTOR driver back to start on demand. Undoes USB - Block Storage.'
$Dependencies = @()
$Tags = @('recovery', 'usb')

$k = 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR'
$old = (Get-ItemProperty -LiteralPath $k).Start
Set-ItemProperty -LiteralPath $k -Name Start -Value 3 -Type DWord -ErrorAction Stop
Write-Output "USBSTOR Start set to 3 (on demand). Previous value: $old"
