$Name = 'Host - Isolate'
$Description = 'Network-isolates the host with Windows Firewall, blocking all traffic except AllowedAddresses (comma separated IPv4 addresses or CIDR ranges). These must include this Kookaburrow server or you will lose contact.'
$Dependencies = @()
$Parameters = @('AllowedAddresses', 'AutoReleaseMinutes?', 'AllowDomainControllers?')
$Tags = @('containment', 'network', 'firewall')

$ErrorActionPreference = 'Stop'
$addrs = @($AllowedAddresses -split '[,; ]+' | Where-Object { $_ })
if (-not $addrs) { throw 'AllowedAddresses is required: list at least the address of the Kookaburrow server, or you will lose contact with this host' }
foreach ($a in $addrs) { $ip = $null; if (-not ([Net.IPAddress]::TryParse(($a -split '/')[0], [ref]$ip)) -or ($a -match '/' -and $a -notmatch '/\d{1,2}$') -or $ip.AddressFamily -ne 'InterNetwork' -or ($a -match '/(\d+)$' -and [int]$Matches[1] -gt 32)) { throw "Not a valid IPv4 address or range: $a" } }
# a domain-joined host checks remote logons with a domain controller, so without one nobody (including this server) could log in to release it
if ($AllowDomainControllers -notmatch '^(no|false|0)$') {
    $dcIps = @()
    # found with a DNS lookup of the domain's controller records (an Active Directory query would fail over WinRM: the double-hop limit)
    try { $cs = Get-CimInstance Win32_ComputerSystem; if ($cs.PartOfDomain) { $dcIps = @(Resolve-DnsName -Type SRV -Name "_ldap._tcp.dc._msdcs.$($cs.Domain)" -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | ForEach-Object { [string]$_.IPAddress } | Where-Object { $_ -match '^(d{1,3}.){3}d{1,3}$' } | Select-Object -Unique) } } catch { Write-Output "Could not look up the domain controllers: $($_.Exception.Message)" }
    if ($dcIps) { $addrs = @($addrs + $dcIps | Select-Object -Unique); Write-Output "Domain controllers also allowed so remote logons keep working: $($dcIps -join ', ')" }
}
$group = 'Kookaburrow Isolation'
if (Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue) { throw 'The host is already isolated. Use Host - Release first.' }
$dir = 'C:\ProgramData\Kookaburrow'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# what to restore: the profile defaults (no existing rule is touched, so there is no rule list to save; older isolations that saved one are still restored)
$on = @()
$profiles = @(Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Enabled = "$($_.Enabled)"; In = "$($_.DefaultInboundAction)"; Out = "$($_.DefaultOutboundAction)" } })
[pscustomobject]@{ Rules = $on; Profiles = $profiles; Isolated = (Get-Date).ToString('s') } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$dir\isolation-state.json" -Encoding UTF8
# the release script, used by Host - Release and by the automatic release
@'
$ErrorActionPreference = 'Continue'
$dir = 'C:\ProgramData\Kookaburrow'
$s = Get-Content -LiteralPath "$dir\isolation-state.json" -Raw | ConvertFrom-Json
Get-NetFirewallRule -Group 'Kookaburrow Isolation' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
foreach ($p in $s.Profiles) { Set-NetFirewallProfile -Profile $p.Name -Enabled $p.Enabled -DefaultInboundAction $p.In -DefaultOutboundAction $p.Out }
$names = @($s.Rules); for ($i = 0; $i -lt $names.Count; $i += 100) { Enable-NetFirewallRule -Name $names[$i..([math]::Min($i + 99, $names.Count - 1))] -ErrorAction SilentlyContinue }
Remove-Item -LiteralPath "$dir\isolation-state.json" -Force
schtasks.exe /delete /tn 'Kookaburrow isolation auto-release' /f 2>$null | Out-Null
'@ | Set-Content -LiteralPath "$dir\release-isolation.ps1" -Encoding UTF8
# the allow rules go in first so contact is never lost
New-NetFirewallRule -DisplayName 'Kookaburrow isolation allow inbound' -Group $group -Direction Inbound -Action Allow -RemoteAddress $addrs -Profile Any | Out-Null
New-NetFirewallRule -DisplayName 'Kookaburrow isolation allow outbound' -Group $group -Direction Outbound -Action Allow -RemoteAddress $addrs -Profile Any | Out-Null
if ($AutoReleaseMinutes -match '^\d+$' -and [int]$AutoReleaseMinutes -gt 0) {
    $at = (Get-Date).AddMinutes([int]$AutoReleaseMinutes).ToString('HH:mm')
    $null = schtasks.exe /create /tn 'Kookaburrow isolation auto-release' /sc once /st $at /ru SYSTEM /rl HIGHEST /f /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dir\release-isolation.ps1"
    Write-Output "Automatic release scheduled for $at (in about $AutoReleaseMinutes minutes)"
}
# block rules beat allow rules, so every address EXCEPT the allowed ones is blocked in both directions: the complement of the allowed ranges
$ranges = foreach ($a in $addrs) {
    $parts = $a -split '/'; $b = [Net.IPAddress]::Parse($parts[0]).GetAddressBytes()
    $n = [uint64]$b[0] * 16777216 + [uint64]$b[1] * 65536 + [uint64]$b[2] * 256 + [uint64]$b[3]
    $size = [math]::Pow(2, 32 - $(if ($parts.Count -gt 1) { [int]$parts[1] } else { 32 }))
    $lo = [math]::Floor($n / $size) * $size
    [pscustomobject]@{ Lo = [uint64]$lo; Hi = [uint64]($lo + $size - 1) }
}
$toIp = { param([uint64]$v) '{0}.{1}.{2}.{3}' -f [math]::Floor($v / 16777216), ([math]::Floor($v / 65536) % 256), ([math]::Floor($v / 256) % 256), ($v % 256) }
$block = @(); $cursor = [uint64]0
foreach ($r in ($ranges | Sort-Object Lo)) {
    if ($r.Lo -gt $cursor) { $block += ('{0}-{1}' -f (& $toIp $cursor), (& $toIp ($r.Lo - 1))) }
    if ($r.Hi + 1 -gt $cursor) { $cursor = $r.Hi + 1 }
}
if ($cursor -le 4294967295) { $block += ('{0}-{1}' -f (& $toIp $cursor), '255.255.255.255') }
$block += '::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' # and all of IPv6
New-NetFirewallRule -DisplayName 'Kookaburrow isolation block inbound' -Group $group -Direction Inbound -Action Block -RemoteAddress $block -Profile Any | Out-Null
New-NetFirewallRule -DisplayName 'Kookaburrow isolation block outbound' -Group $group -Direction Outbound -Action Block -RemoteAddress $block -Profile Any | Out-Null
Set-NetFirewallProfile -All -Enabled True -DefaultInboundAction Block -DefaultOutboundAction Block
Write-Output "Isolated: everything except the allowed addresses is blocked; only $($addrs -join ', ') can reach this host. Use Host - Release to undo."
