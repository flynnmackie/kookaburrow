$Name = 'Firewall - Unblock Address'
$Description = 'Removes the Windows Firewall rules created by Firewall - Block Address for one remote IP address, restoring traffic to and from it.'
$Dependencies = @()
$Parameters = @('RemoteAddress')
$Tags = @('network', 'firewall', 'recovery')

$ip = $null
if (-not [Net.IPAddress]::TryParse($RemoteAddress, [ref]$ip)) { throw 'RemoteAddress must be a single valid IP address' }
$addr = $ip.ToString()
$removed = 0
foreach ($dir in 'Inbound', 'Outbound') {
    $rule = "Kookaburrow block $addr ($dir)"
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -DisplayName $rule -ErrorAction Stop; Write-Output "Removed rule: $rule"; $removed++ }
}
if (-not $removed) { Write-Output "No Kookaburrow block rules exist for $addr." }
