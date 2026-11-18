$Name = 'DNS - Cache and Hosts'
$Description = 'Dumps the client DNS resolver cache and any active entries in the hosts file.'
$Dependencies = @()
$Tags = @('network', 'dns', 'c2', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'

# One row per cached DNS record and per name in an active hosts-file line (Source says which).
Get-DnsClientCache | Sort-Object Entry | ForEach-Object {
    [pscustomobject]@{ Source = 'DNS cache'; Entry = $_.Entry; RecordName = $_.RecordName; Type = "$($_.Type)"; Data = $_.Data; TimeToLive = $_.TimeToLive }
}
Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" | ForEach-Object {
    $p = @((($_ -replace '#.*$', '').Trim()) -split '\s+' | Where-Object { $_ })
    if ($p.Count -ge 2) {
        foreach ($n in $p[1..($p.Count - 1)]) { [pscustomobject]@{ Source = 'Hosts file'; Entry = $n; RecordName = $n; Type = 'hosts'; Data = $p[0]; TimeToLive = '' } }
    }
}
