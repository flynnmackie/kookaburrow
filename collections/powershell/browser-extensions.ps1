$Name = 'Browser - Extensions'
$Description = 'Browser extensions for Chrome, Edge, Brave and Firefox in every user profile: name, version, ID, requested permissions and install time.'
$Dependencies = @()
$Tags = @('persistence', 'inventory', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$chromium = @{ Chrome = 'AppData\Local\Google\Chrome\User Data'; Edge = 'AppData\Local\Microsoft\Edge\User Data'; Brave = 'AppData\Local\BraveSoftware\Brave-Browser\User Data' }
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    foreach ($b in $chromium.Keys) {
        $base = Join-Path $p.LocalPath $chromium[$b]
        foreach ($prof in Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) {
            foreach ($ext in Get-ChildItem -LiteralPath "$($prof.FullName)\Extensions" -Directory) {
                $ver = Get-ChildItem -LiteralPath $ext.FullName -Directory | Sort-Object Name | Select-Object -Last 1
                $mf = Get-Content -LiteralPath "$($ver.FullName)\manifest.json" -Raw | ConvertFrom-Json
                if (-not $mf) { continue }
                $name = $mf.name
                if ($name -like '__MSG_*') { $key = $name.Trim('_') -replace '^MSG_', ''; $msg = Get-Content -LiteralPath "$($ver.FullName)\_locales\en\messages.json" -Raw | ConvertFrom-Json; $name = $msg.$key.message; if (-not $name) { $name = $mf.name } }
                [pscustomobject]@{ User = $u; Browser = $b; Profile = $prof.Name; Id = $ext.Name; Name = $name; Version = $mf.version; Permissions = (@($mf.permissions) -join ', '); HostPermissions = ((@($mf.host_permissions) + @($mf.content_scripts.matches)) -join ', '); UpdateUrl = $mf.update_url; Installed = $ext.CreationTime }
            }
        }
    }
    foreach ($fp in Get-ChildItem -LiteralPath "$($p.LocalPath)\AppData\Roaming\Mozilla\Firefox\Profiles" -Directory) {
        $j = Get-Content -LiteralPath "$($fp.FullName)\extensions.json" -Raw | ConvertFrom-Json
        foreach ($a in $j.addons | Where-Object { $_.location -ne 'app-builtin' -and $_.location -ne 'app-system-defaults' }) {
            [pscustomobject]@{ User = $u; Browser = 'Firefox'; Profile = $fp.Name; Id = $a.id; Name = $a.defaultLocale.name; Version = $a.version; Permissions = (@($a.userPermissions.permissions) -join ', '); HostPermissions = (@($a.userPermissions.origins) -join ', '); UpdateUrl = $a.sourceURI; Installed = if ($a.installDate) { [DateTimeOffset]::FromUnixTimeMilliseconds($a.installDate).LocalDateTime } else { '' } }
        }
    }
}
