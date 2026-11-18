$Name = 'Network - Port Proxies'
$Description = 'netsh port proxy rules. They forward a local port to another host, which attackers use to pivot or expose an internal service.'
$Dependencies = @()
$Tags = @('network', 'lateral-movement', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
$out = netsh interface portproxy show all 2>&1
foreach ($l in $out) { if ($l -match '^\s*(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s*$') { [pscustomobject]@{ ListenAddress = $Matches[1]; ListenPort = $Matches[2]; ConnectAddress = $Matches[3]; ConnectPort = $Matches[4] } } }
