$Name = 'Hosts File - Add Entry'
$Description = 'Adds a line to the hosts file to sinkhole a domain: Hostname resolves to Address (default 0.0.0.0, which makes connections fail). The hosts file is backed up to C:\ProgramData\Kookaburrow\Quarantine first. Use DNS - Flush Cache afterwards.'
$Dependencies = @()
$Parameters = @('Hostname', 'Address?')
$Tags = @('dns', 'network', 'containment')

if ($Hostname -notmatch '^[A-Za-z0-9._-]+$') { throw 'Hostname may contain only letters, digits, dots, dashes and underscores' }
$addr = if ($Address) { $Address } else { '0.0.0.0' }
$ip = $null; if (-not [Net.IPAddress]::TryParse($addr, [ref]$ip)) { throw 'Address must be a valid IP address' }
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -LiteralPath $hosts -Destination (Join-Path $dir ('{0:yyyyMMdd-HHmmss}_hosts.bak' -f (Get-Date))) -Force
if (Select-String -LiteralPath $hosts -Pattern "^\s*[0-9a-fA-F:.]+\s+$([regex]::Escape($Hostname))\s*($|#)" -Quiet) { Write-Output "$Hostname is already in the hosts file."; return }
Add-Content -LiteralPath $hosts -Value "$addr $Hostname # Kookaburrow sinkhole $(Get-Date -Format s)" -Encoding ASCII
Write-Output "Added: $addr $Hostname"
