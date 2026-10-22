$Name = 'USB - History'
$Description = 'USB storage devices ever connected: vendor, product, serial number, first install and last connected / removed times (from the USBSTOR registry properties), plus drive letters in MountedDevices and the USB lines in setupapi.dev.log. Shows data theft and malware delivery via removable media (like Windows.Forensics.USBHistory).'
$Dependencies = @()
$Tags = @('forensics', 'inventory', 'lateral-movement')

$ErrorActionPreference = 'SilentlyContinue'
function Get-DevTime($key, $id) {
    $v = (Get-ItemProperty "$key\Properties\{83da6326-97a6-4088-9453-a1923f573b29}\$id\00000000").Data
    if ($v -is [byte[]] -and $v.Length -ge 8) { [DateTime]::FromFileTimeUtc([BitConverter]::ToInt64($v, 0)) } else { '' }
}
foreach ($class in Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Enum\USBSTOR') {
    foreach ($dev in Get-ChildItem $class.PSPath) {
        $p = Get-ItemProperty $dev.PSPath
        [pscustomobject]@{
            Source = 'USBSTOR'; Device = $p.FriendlyName; Class = $class.PSChildName; Serial = $dev.PSChildName; ContainerId = $p.ContainerID
            FirstInstallUtc = (Get-DevTime $dev.PSPath '0064'); LastConnectedUtc = (Get-DevTime $dev.PSPath '0066'); LastRemovedUtc = (Get-DevTime $dev.PSPath '0067')
        }
    }
}
$md = Get-Item 'HKLM:\SYSTEM\MountedDevices'
foreach ($n in $md.GetValueNames() | Where-Object { $_ -like '\DosDevices\*' }) {
    $v = $md.GetValue($n)
    if ($v -is [byte[]]) { $t = [Text.Encoding]::Unicode.GetString($v); if ($t -match 'USB|STOR') { [pscustomobject]@{ Source = 'MountedDevices'; Device = $n; Class = ''; Serial = ($t -replace '[^\x20-\x7e]', ''); ContainerId = ''; FirstInstallUtc = ''; LastConnectedUtc = ''; LastRemovedUtc = '' } } }
}
Select-String -Path "$env:SystemRoot\INF\setupapi.dev.log" -Pattern 'Device Install \(Hardware initiated\).*USB' -Context 0, 1 | Select-Object -First 100 | ForEach-Object {
    [pscustomobject]@{ Source = 'setupapi.dev.log'; Device = $_.Line.Trim(); Class = ''; Serial = ''; ContainerId = ''; FirstInstallUtc = ($_.Context.PostContext -join ' ').Trim(); LastConnectedUtc = ''; LastRemovedUtc = '' }
}
