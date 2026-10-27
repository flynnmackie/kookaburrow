$Name = 'Files - Quarantine'
$Description = 'Moves a file into C:\ProgramData\Kookaburrow\Quarantine under a timestamped name, recording its SHA-256 first.'
$Dependencies = @()
$Parameters = @('FilePath')
$Tags = @('filesystem', 'malware', 'containment')

if (-not $FilePath -or $FilePath -match '[\*\?]') { throw 'FilePath is required and must not contain wildcards' }
$item = Get-Item -LiteralPath $FilePath -ErrorAction Stop
if ($item.PSIsContainer) { throw 'FilePath must be a file, not a folder' }
$hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
$dir = 'C:\ProgramData\Kookaburrow\Quarantine'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dest = Join-Path $dir ('{0:yyyyMMdd-HHmmss}_{1}.quarantined' -f (Get-Date), $item.Name)
Move-Item -LiteralPath $item.FullName -Destination $dest -ErrorAction Stop
Write-Output "Quarantined $($item.FullName)"
Write-Output "SHA256: $hash"
Write-Output "Moved to: $dest"
