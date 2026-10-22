$Name = 'PowerShell - Collect History'
$Description = 'Copies each user PSReadLine history file (ConsoleHost_history.txt) and any PowerShell transcript files found in Documents and the common transcript locations, as raw evidence of commands typed and run. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Tags = @('powershell', 'execution', 'history', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
foreach ($p in (Get-CimInstance Win32_UserProfile | Where-Object { $_.LocalPath -and -not $_.Special })) {
    $u = Split-Path $p.LocalPath -Leaf
    $src = "$($p.LocalPath)\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
    if (Test-Path -LiteralPath $src) { $dst = Join-Path $OutDir "$u\ConsoleHost_history.txt"; New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null; Copy-Item -LiteralPath $src -Destination $dst -Force; [pscustomobject]@{ User = $u; Kind = 'History'; File = $src; SizeBytes = (Get-Item -LiteralPath $src).Length } }
    foreach ($t in Get-ChildItem -LiteralPath $p.LocalPath -Filter 'PowerShell_transcript*.txt' -Recurse -Force -File -Depth 3) {
        $dst = Join-Path $OutDir "$u\Transcripts\$($t.Name)"; New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null; Copy-Item -LiteralPath $t.FullName -Destination $dst -Force
        [pscustomobject]@{ User = $u; Kind = 'Transcript'; File = $t.FullName; SizeBytes = $t.Length }
    }
}
