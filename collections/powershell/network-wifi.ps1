$Name = 'Network - Wi-Fi Profiles'
$Description = 'Saved wireless networks: SSID, authentication and cipher. Passwords are not collected. Shows where a laptop has connected, including rogue and public networks.'
$Dependencies = @()
$Tags = @('network', 'inventory')

$ErrorActionPreference = 'SilentlyContinue'
$names = (netsh wlan show profiles) | Select-String 'All User Profile|User Profile' | ForEach-Object { ($_ -split ':', 2)[1].Trim() } | Sort-Object -Unique
foreach ($n in $names) {
    $d = (netsh wlan show profile name="$n") -join "`n"
    [pscustomobject]@{
        Profile = $n
        Authentication = if ($d -match 'Authentication\s*:\s*(.+)') { $Matches[1].Trim() } else { '' }
        Cipher = if ($d -match 'Cipher\s*:\s*(.+)') { $Matches[1].Trim() } else { '' }
        ConnectionMode = if ($d -match 'Connection mode\s*:\s*(.+)') { $Matches[1].Trim() } else { '' }
    }
}
if (-not $names) { 'No wireless profiles (or no WLAN service).' }
