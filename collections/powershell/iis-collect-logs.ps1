$Name = 'IIS - Collect Logs'
$Description = 'Copies IIS web server logs from C:\inetpub\logs\LogFiles (and the HTTPERR folder) plus the server configuration (applicationHost.config), for web shell and exploitation investigations. Days limits to log files changed in the last N days (default 14). Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('Days?')
$Tags = @('forensics', 'filesystem', 'c2')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$since = (Get-Date).AddDays(-$(if ($Days -match '^\d+$') { [int]$Days } else { 14 }))
$roots = @("$env:SystemDrive\inetpub\logs\LogFiles", "$env:SystemRoot\System32\LogFiles\HTTPERR")
foreach ($r in $roots) {
    foreach ($f in Get-ChildItem -LiteralPath $r -Recurse -File -Force | Where-Object { $_.LastWriteTime -ge $since }) {
        $dst = Join-Path $OutDir ($f.FullName.Substring(3))
        New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
        Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
        [pscustomobject]@{ File = $f.FullName; SizeBytes = $f.Length; Modified = $f.LastWriteTime }
    }
}
$cfg = "$env:SystemRoot\System32\inetsrv\config\applicationHost.config"
if (Test-Path -LiteralPath $cfg) { Copy-Item -LiteralPath $cfg -Destination (Join-Path $OutDir 'applicationHost.config') -Force; [pscustomobject]@{ File = $cfg; SizeBytes = (Get-Item -LiteralPath $cfg).Length; Modified = (Get-Item -LiteralPath $cfg).LastWriteTime } }
