$Name = 'Block remote address in firewall'
$Description = 'Adds inbound and outbound Windows Firewall rules blocking one remote IP address, for example a C2 server.'
$Dependencies = @()
$Parameters = @('RemoteAddress')
$Tags = @('network', 'firewall', 'containment')

$ip = $null
if (-not [Net.IPAddress]::TryParse($RemoteAddress, [ref]$ip)) { throw 'RemoteAddress must be a single valid IP address' }
$addr = $ip.ToString()
foreach ($dir in 'Inbound', 'Outbound') {
    $rule = "Kookaburrow block $addr ($dir)"
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Write-Output "Rule exists: $rule"; continue }
    New-NetFirewallRule -DisplayName $rule -Direction $dir -Action Block -RemoteAddress $addr -Profile Any | Out-Null
    Write-Output "Created rule: $rule"
}
