$Name = 'Files - Delete'
$Description = 'Permanently deletes one file after recording its SHA-256 and size.'
$Dependencies = @()
$Parameters = @('FilePath')
$Tags = @('filesystem', 'malware', 'remediation')

if (-not $FilePath -or $FilePath -match '[\*\?]') { throw 'FilePath is required and must not contain wildcards' }
$f = Get-Item -LiteralPath $FilePath -Force -ErrorAction Stop
if ($f.PSIsContainer) { throw 'FilePath must be a file, not a folder' }
$hash = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
Write-Output "Deleted $($f.FullName)"
Write-Output "SHA256: $hash  Size: $($f.Length) bytes  Modified: $($f.LastWriteTime)"
