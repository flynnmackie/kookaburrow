$Name = 'Network - Routing Table'
$Description = 'IPv4 and IPv6 routes with gateway and metric. A new default route or a route to an internal range through an unexpected gateway can redirect traffic.'
$Dependencies = @()
$Tags = @('network', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
Get-NetRoute | Where-Object { $_.DestinationPrefix -notmatch '^(ff00|fe80|224\.|255\.255\.255\.255)' } | ForEach-Object { [pscustomobject]@{ Destination = $_.DestinationPrefix; NextHop = $_.NextHop; Metric = $_.RouteMetric; Interface = $_.InterfaceAlias; Protocol = "$($_.Protocol)" } }
