$Name = 'Security - Disable LLMNR and NetBIOS'
$Description = 'Turns off LLMNR (by policy) and NetBIOS over TCP/IP on every network adapter, closing the name-resolution poisoning path that tools like Responder use to capture credentials.'
$Dependencies = @()
$Tags = @('hardening', 'network', 'lateral-movement')

$k = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient'
New-Item -Path $k -Force | Out-Null
Set-ItemProperty -Path $k -Name EnableMulticast -Value 0 -Type DWord
Write-Output 'LLMNR disabled by policy (EnableMulticast = 0).'
foreach ($a in Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True') {
    $r = Invoke-CimMethod -InputObject $a -MethodName SetTcpipNetbios -Arguments @{ TcpipNetbiosOptions = [uint32]2 }
    Write-Output "NetBIOS over TCP/IP disabled on $($a.Description) (result $($r.ReturnValue))"
}
