$Name = 'Firewall - Block Port'
$Description = 'Adds a Windows Firewall rule that blocks one TCP or UDP port in one direction (Inbound by default), for example 3389 to stop RDP or 445 to stop SMB while you contain a host. Protocol is TCP or UDP (default TCP); Direction is Inbound or Outbound.'
$Dependencies = @()
$Parameters = @('Port', 'Protocol?', 'Direction?')
$Tags = @('network', 'firewall', 'containment')

if ($Port -notmatch '^\d{1,5}$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535) { throw 'Port must be a number from 1 to 65535' }
$proto = if ($Protocol) { $Protocol.ToUpper() } else { 'TCP' }
if ($proto -notin 'TCP', 'UDP') { throw 'Protocol must be TCP or UDP' }
$dir = if ($Direction) { (Get-Culture).TextInfo.ToTitleCase($Direction.ToLower()) } else { 'Inbound' }
if ($dir -notin 'Inbound', 'Outbound') { throw 'Direction must be Inbound or Outbound' }
$rule = "Kookaburrow block port $proto/$Port ($dir)"
if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) { Write-Output "Rule exists: $rule"; return }
$p = @{ DisplayName = $rule; Direction = $dir; Action = 'Block'; Protocol = $proto; Profile = 'Any' }
if ($dir -eq 'Inbound') { $p.LocalPort = $Port } else { $p.RemotePort = $Port }
New-NetFirewallRule @p | Out-Null
Write-Output "Created rule: $rule"
