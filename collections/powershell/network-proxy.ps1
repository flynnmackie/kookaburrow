$Name = 'Network - Proxy Settings'
$Description = 'WinHTTP and per-user Internet proxy settings and auto-config scripts.'
$Dependencies = @()
$Tags = @('network', 'c2', 'persistence')

$ErrorActionPreference = 'SilentlyContinue'
[pscustomobject]@{ Scope = 'WinHTTP'; User = 'machine'; ProxyEnable = ''; ProxyServer = ((netsh winhttp show proxy) -join ' ').Trim(); AutoConfigUrl = ''; ProxyOverride = '' }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special -and (Test-Path "Registry::HKEY_USERS\$($_.SID)") })) {
    $k = Get-ItemProperty "Registry::HKEY_USERS\$($p.SID)\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
    [pscustomobject]@{ Scope = 'User'; User = (Split-Path $p.LocalPath -Leaf); ProxyEnable = $k.ProxyEnable; ProxyServer = $k.ProxyServer; AutoConfigUrl = $k.AutoConfigURL; ProxyOverride = $k.ProxyOverride }
}
