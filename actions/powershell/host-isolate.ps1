$Name = 'Host - Isolate'
$Description = 'Network-isolates the host: every enabled Windows Firewall allow rule is switched off (their names are saved so they can be restored), the firewall is turned on for all profiles with inbound and outbound blocked by default, and traffic with AllowedAddresses (comma separated IP addresses or CIDR ranges, which must include this Kookaburrow server or you will lose contact) is allowed in both directions. AutoReleaseMinutes schedules an automatic release as a safety net if you lose contact. Undo it with Host - Release.'
$Dependencies = @()
$Parameters = @('AllowedAddresses', 'AutoReleaseMinutes?')
$Tags = @('containment', 'network', 'firewall')

$ErrorActionPreference = 'Stop'
$addrs = @($AllowedAddresses -split '[,; ]+' | Where-Object { $_ })
if (-not $addrs) { throw 'AllowedAddresses is required: list at least the address of the Kookaburrow server, or you will lose contact with this host' }
foreach ($a in $addrs) { $ip = $null; if (-not ([Net.IPAddress]::TryParse(($a -split '/')[0], [ref]$ip)) -or ($a -match '/' -and $a -notmatch '/\d{1,3}$')) { throw "Not a valid IP address or range: $a" } }
$group = 'Kookaburrow Isolation'
if (Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue) { throw 'The host is already isolated. Use Host - Release first.' }
$dir = 'C:\ProgramData\Kookaburrow'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# what to restore: the allow rules that are on now, and the profile defaults
$on = @(Get-NetFirewallRule -Enabled True -Action Allow | Where-Object { $_.Direction -in 'Inbound', 'Outbound' } | ForEach-Object { $_.Name })
$profiles = @(Get-NetFirewallProfile | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Enabled = "$($_.Enabled)"; In = "$($_.DefaultInboundAction)"; Out = "$($_.DefaultOutboundAction)" } })
[pscustomobject]@{ Rules = $on; Profiles = $profiles; Isolated = (Get-Date).ToString('s') } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$dir\isolation-state.json" -Encoding UTF8
# the release script, used by Host - Release and by the automatic release
@'
$ErrorActionPreference = 'Continue'
$dir = 'C:\ProgramData\Kookaburrow'
$s = Get-Content -LiteralPath "$dir\isolation-state.json" -Raw | ConvertFrom-Json
Get-NetFirewallRule -Group 'Kookaburrow Isolation' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
foreach ($p in $s.Profiles) { Set-NetFirewallProfile -Profile $p.Name -Enabled $p.Enabled -DefaultInboundAction $p.In -DefaultOutboundAction $p.Out }
foreach ($r in $s.Rules) { Enable-NetFirewallRule -Name $r -ErrorAction SilentlyContinue }
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
$null = $on | ForEach-Object { Disable-NetFirewallRule -Name $_ -ErrorAction SilentlyContinue }
Enable-NetFirewallRule -Group $group
Set-NetFirewallProfile -All -Enabled True -DefaultInboundAction Block -DefaultOutboundAction Block
Write-Output "Isolated: $($on.Count) allow rules switched off; only $($addrs -join ', ') can reach this host. Use Host - Release to undo."
