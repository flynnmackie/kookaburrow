$Name = 'Network - Firewall Profile State'
$Description = 'Whether the Windows Firewall is on for each profile, the default inbound and outbound actions and logging settings.'
$Dependencies = @()
$Tags = @('network', 'defense-evasion', 'security')

$ErrorActionPreference = 'SilentlyContinue'
Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ Profile = $_.Name; Enabled = $_.Enabled; DefaultInbound = "$($_.DefaultInboundAction)"; DefaultOutbound = "$($_.DefaultOutboundAction)"; LogAllowed = $_.LogAllowed; LogBlocked = $_.LogBlocked; LogFile = $_.LogFileName } }
