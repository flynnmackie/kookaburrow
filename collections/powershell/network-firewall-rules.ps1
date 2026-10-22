$Name = 'Firewall - Rules'
$Description = 'Windows Firewall rules read straight from the registry (fast even with thousands of rules): action, direction, protocol, ports, program and whether active. Filter text is optional and matches anywhere in the rule, for example 3389, Allow or a program name. Look for allow rules to unusual programs or ports (like Windows.Sys.FirewallRules).'
$Dependencies = @()
$Parameters = @('Filter?')
$Tags = @('network', 'persistence', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$k = Get-Item 'HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules'
foreach ($n in $k.GetValueNames()) {
    $raw = [string]$k.GetValue($n)
    if ($Filter -and $raw -notlike "*$Filter*") { continue }
    $f = @{}
    foreach ($p in ($raw -split '\|')) { if ($p -match '^([^=]+)=(.*)$') { $f[$Matches[1]] = $Matches[2] } }
    [pscustomobject]@{ Name = $f['Name']; Action = $f['Action']; Direction = $f['Dir']; Active = $f['Active']; Protocol = $f['Protocol']; LocalPort = $f['LPort']; RemotePort = $f['RPort']; RemoteAddr = $f['RA4']; Program = $f['App']; Service = $f['Svc']; Profile = $f['Profile'] }
}
