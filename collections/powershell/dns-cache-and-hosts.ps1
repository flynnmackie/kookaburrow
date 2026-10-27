$Name = 'DNS - Cache and Hosts'
$Description = 'Dumps the client DNS resolver cache and any active entries in the hosts file.'
$Dependencies = @()
$Tags = @('network', 'dns', 'c2', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'

'== DNS client cache =='
$dns = Get-DnsClientCache
if ($dns) {
    $dns | Select-Object Entry, RecordName, Type, Data, TimeToLive | Sort-Object Entry | Format-Table -AutoSize
} else { '(empty or not readable)' }

'== Hosts file (active entries) =='
$hosts = Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" | Where-Object { $_ -and $_.Trim() -notmatch '^#' }
if ($hosts) { $hosts } else { '(none)' }
