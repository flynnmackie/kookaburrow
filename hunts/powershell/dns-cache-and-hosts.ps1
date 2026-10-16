$Name = 'DNS cache and hosts file'
$Description = 'Dumps the client DNS resolver cache and any active entries in the hosts file. Useful for spotting command and control domains a host has recently resolved and for hosts file tampering.'
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
