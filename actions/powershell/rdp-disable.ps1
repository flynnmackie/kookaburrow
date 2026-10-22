$Name = 'RDP - Disable'
$Description = 'Turns off Remote Desktop: sets fDenyTSConnections so new RDP connections are refused, and disables the Remote Desktop firewall rules. Existing sessions stay connected until logged off (use Accounts - Log Off Session). Use it to stop an attacker coming in over RDP.'
$Dependencies = @()
$Tags = @('containment', 'rdp', 'hardening')

$k = 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
$old = (Get-ItemProperty -LiteralPath $k).fDenyTSConnections
Set-ItemProperty -LiteralPath $k -Name fDenyTSConnections -Value 1 -Type DWord -ErrorAction Stop
Get-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue | Disable-NetFirewallRule
Write-Output "Remote Desktop disabled (fDenyTSConnections was $old). Rules in the Remote Desktop group are switched off."
