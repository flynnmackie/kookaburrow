$Name = 'Firewall - Unblock Port'
$Description = 'Removes the rules created by Firewall - Block Port for one port, in both directions and both protocols unless Protocol (TCP or UDP) or Direction (Inbound or Outbound) is given.'
$Dependencies = @()
$Parameters = @('Port', 'Protocol?', 'Direction?')
$Tags = @('network', 'firewall', 'recovery')

if ($Port -notmatch '^\d{1,5}$') { throw 'Port must be a number' }
$protos = if ($Protocol) { @($Protocol.ToUpper()) } else { @('TCP', 'UDP') }
$dirs = if ($Direction) { @((Get-Culture).TextInfo.ToTitleCase($Direction.ToLower())) } else { @('Inbound', 'Outbound') }
$n = 0
foreach ($p in $protos) { foreach ($d in $dirs) {
    $rule = "Kookaburrow block port $p/$Port ($d)"
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -DisplayName $rule; Write-Output "Removed rule: $rule"; $n++ }
} }
if (-not $n) { Write-Output "No Kookaburrow rules block port $Port." }
