$Name = 'PowerShell - Console History'
$Description = 'The PSReadLine command history of every user (ConsoleHost_history.txt), one row per command with its line number and the file modified time.'
$Dependencies = @()
$Parameters = @('Contains?')
$Tags = @('powershell', 'execution', 'history')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $f = "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
    $i = Get-Item -LiteralPath $f -Force
    if (-not $i) { continue }
    $n = 0
    foreach ($line in (Get-Content -LiteralPath $f)) {
        $n++
        if ($Contains -and $line -notlike "*$Contains*") { continue }
        [pscustomobject]@{ User = (Split-Path $p.LocalPath -Leaf); Line = $n; Command = $line; FileModified = $i.LastWriteTime }
    }
}
