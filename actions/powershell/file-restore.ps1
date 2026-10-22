$Name = 'Files - Restore Quarantined'
$Description = 'Moves a file out of C:\ProgramData\Kookaburrow\Quarantine back to a location you choose. QuarantinedName is the file name in the quarantine folder (for example 20261022-101500_invoice.exe.quarantined) and RestorePath the full path to put it at. Refuses to overwrite an existing file.'
$Dependencies = @()
$Parameters = @('QuarantinedName', 'RestorePath')
$Tags = @('filesystem', 'recovery')

$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
if (-not $QuarantinedName -or $QuarantinedName -match '[\\/]') { throw 'QuarantinedName must be just the file name inside the quarantine folder' }
$src = Join-Path $dir $QuarantinedName
if (-not (Test-Path -LiteralPath $src)) { throw "Not in quarantine: $QuarantinedName" }
if (-not $RestorePath -or (Test-Path -LiteralPath $RestorePath)) { throw 'RestorePath is required and must not already exist' }
New-Item -ItemType Directory -Force -Path (Split-Path $RestorePath) | Out-Null
Move-Item -LiteralPath $src -Destination $RestorePath -ErrorAction Stop
Write-Output "Restored to $RestorePath (SHA256 $((Get-FileHash -LiteralPath $RestorePath -Algorithm SHA256).Hash))"
