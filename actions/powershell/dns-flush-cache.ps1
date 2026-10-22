$Name = 'DNS - Flush Cache'
$Description = 'Clears the DNS resolver cache on the host, for example after changing the hosts file or sinkholing a domain, so the change takes effect immediately.'
$Dependencies = @()
$Tags = @('dns', 'network', 'recovery')

Clear-DnsClientCache -ErrorAction Stop
Write-Output 'DNS client cache cleared.'
