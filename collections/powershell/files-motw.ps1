$Name = 'Files - Downloaded (MOTW)'
$Description = 'Files with a Mark of the Web (the Zone.Identifier alternate data stream) in user Downloads, Desktop, Documents and Temp folders, showing the zone, the URL it was downloaded from and the referring page. Tells you where a file came from and when it arrived. Set Days to limit to files changed in the last N days (default 30).'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('filesystem', 'forensics', 'execution', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-$(if ($Days -match '^\d+$') { [int]$Days } else { 30 }))
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    foreach ($sub in 'Downloads', 'Desktop', 'Documents', 'AppData\Local\Temp') {
        Get-ChildItem -LiteralPath "$($p.LocalPath)\$sub" -Recurse -Force -File -Depth 3 | Where-Object { $_.LastWriteTime -ge $since } | ForEach-Object {
            $z = Get-Content -LiteralPath $_.FullName -Stream Zone.Identifier -Raw
            if (-not $z) { return }
            [pscustomobject]@{
                User = (Split-Path $p.LocalPath -Leaf); Path = $_.FullName; SizeBytes = $_.Length; Modified = $_.LastWriteTime
                Zone = if ($z -match 'ZoneId=(\d)') { $Matches[1] } else { '' }
                HostUrl = if ($z -match 'HostUrl=(.+)') { $Matches[1].Trim() } else { '' }
                ReferrerUrl = if ($z -match 'ReferrerUrl=(.+)') { $Matches[1].Trim() } else { '' }
            }
        }
    }
}
