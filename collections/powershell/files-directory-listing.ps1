$Name = 'Files - Directory Listing'
$Description = 'Lists the contents of a folder with sizes, timestamps and attributes, including hidden and system files. Optionally recursive. DirPath is required; MaxResults defaults to 5000. Use it to see what is in a staging folder, a user profile or a web root.'
$Dependencies = @()
$Parameters = @('DirPath', 'Recurse?', 'MaxResults?')
$Tags = @('filesystem', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$max = if ($MaxResults -match '^\d+$') { [int]$MaxResults } else { 5000 }
$gci = @{ LiteralPath = $DirPath; Force = $true }
if ($Recurse -match '^(y|yes|true|1)$') { $gci.Recurse = $true }
Get-ChildItem @gci | Select-Object -First $max | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; Type = $(if ($_.PSIsContainer) { 'Folder' } else { 'File' }); SizeBytes = $(if ($_.PSIsContainer) { '' } else { $_.Length }); Created = $_.CreationTime; Modified = $_.LastWriteTime; Accessed = $_.LastAccessTime; Attributes = $_.Attributes } }
