$Name = 'Hosts File - Remove Entry'
$Description = 'Removes every hosts file line for a hostname, for example to undo Hosts File - Add Entry.'
$Dependencies = @()
$Parameters = @('Hostname')
$Tags = @('dns', 'network', 'recovery')

if ($Hostname -notmatch '^[A-Za-z0-9._-]+$') { throw 'Hostname may contain only letters, digits, dots, dashes and underscores' }
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$lines = Get-Content -LiteralPath $hosts
$pat = "^\s*[0-9a-fA-F:.]+\s+$([regex]::Escape($Hostname))\s*($|#)"
$gone = @($lines | Where-Object { $_ -match $pat })
if (-not $gone) { Write-Output "No hosts file entry for $Hostname."; return }
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -LiteralPath $hosts -Destination (Join-Path $dir ('{0:yyyyMMdd-HHmmss}_hosts.bak' -f (Get-Date))) -Force
Set-Content -LiteralPath $hosts -Value ($lines | Where-Object { $_ -notmatch $pat }) -Encoding ASCII
$gone | ForEach-Object { Write-Output "Removed: $_" }
