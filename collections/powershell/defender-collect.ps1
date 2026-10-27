$Name = 'Defender - Collect Logs'
$Description = 'Copies Microsoft Defender evidence. Needs administrator rights.'
$Dependencies = @()
$Tags = @('antivirus', 'forensics', 'malware')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$base = "$env:ProgramData\Microsoft\Windows Defender"
foreach ($sub in 'Support', 'Scans\History\Service\DetectionHistory') {
    foreach ($f in Get-ChildItem -LiteralPath "$base\$sub" -Recurse -File -Force) {
        $rel = $f.FullName.Substring($base.Length + 1)
        $dst = Join-Path $OutDir $rel
        New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
        Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
        [pscustomobject]@{ File = $rel; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
    }
}
Get-MpThreatDetection | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir 'ThreatDetections.json') -Encoding UTF8
Get-MpPreference | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir 'Preferences.json') -Encoding UTF8
Get-MpComputerStatus | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutDir 'ComputerStatus.json') -Encoding UTF8
[pscustomobject]@{ File = 'ThreatDetections.json, Preferences.json, ComputerStatus.json'; SizeBytes = ''; Modified = (Get-Date) }
