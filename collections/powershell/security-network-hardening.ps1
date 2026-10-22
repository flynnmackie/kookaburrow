$Name = 'Security - Network Hardening'
$Description = 'Name-resolution and protocol settings that enable relay and spoofing attacks: LLMNR, NetBIOS over TCP/IP per adapter, mDNS, WPAD auto-proxy, SMBv1, IPv6 router advertisements, Remote Desktop NLA, WinRM listeners and unencrypted traffic, and whether Windows Firewall is on for each profile. LLMNR and NetBIOS poisoning (Responder) is a leading way to capture credentials.'
$Dependencies = @()
$Tags = @('inventory', 'network', 'lateral-movement', 'security')

$ErrorActionPreference = 'SilentlyContinue'
function V($path, $name) { (Get-ItemProperty -LiteralPath $path -Name $name).$name }
function Row($setting, $value, $meaning) { [pscustomobject]@{ Setting = $setting; Value = $(if ($null -eq $value) { '(not set)' } else { $value }); Meaning = $meaning } }
Row 'LLMNR disabled (EnableMulticast policy)' (V 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' 'EnableMulticast') '0 = LLMNR off; not set or 1 = on (spoofable)'
Row 'mDNS disabled (EnableMDNS)' (V 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters' 'EnableMDNS') '0 = mDNS off'
foreach ($a in Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True') { Row "NetBIOS over TCP/IP: $($a.Description)" $a.TcpipNetbiosOptions '2 = disabled, 0 or 1 = enabled (spoofable)' }
Row 'WPAD auto-detect (AutoDetect, current user)' (V 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' 'AutoDetect') '1 = proxy auto-detection on (spoofable)'
Row 'SMBv1 server enabled' (Get-SmbServerConfiguration).EnableSMB1Protocol 'True = SMBv1 on (EternalBlue)'
Row 'Remote Desktop NLA required (UserAuthentication)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication') '1 = network level authentication required'
Row 'Remote Desktop enabled (fDenyTSConnections)' (V 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections') '0 = RDP enabled'
Row 'WinRM listeners' ((Get-ChildItem WSMan:\localhost\Listener | ForEach-Object { "$($_.Keys -join ' ')" }) -join ' | ') 'Transport and address of each WinRM listener'
Row 'WinRM allows unencrypted traffic' (V 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WinRM\Service' 'AllowUnencryptedTraffic') '1 = unencrypted WinRM allowed'
foreach ($p in Get-NetFirewallProfile) { Row "Windows Firewall: $($p.Name)" "enabled=$($p.Enabled) in=$($p.DefaultInboundAction) out=$($p.DefaultOutboundAction)" 'Enabled should be True' }
Row 'IPv6 router advertisements accepted' (V 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters' 'DisabledComponents') '255 = IPv6 disabled; otherwise IPv6 is active (mitm6 risk)'
