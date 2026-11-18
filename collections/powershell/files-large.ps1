$Name = 'Files - Largest Files in User Areas'
$Description = 'The largest files under user folders and ProgramData (default over 200 MB). Large archives, disk images and database dumps are what data theft is made of.'
$Dependencies = @()
$Parameters = @('MinMB?')
$Tags = @('filesystem', 'exfiltration', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$mb = if ($MinMB) { [int]$MinMB } else { 200 }
foreach ($r in "$env:SystemDrive\Users", $env:ProgramData, "$env:SystemDrive\Temp") { if (Test-Path $r) { Get-ChildItem $r -Recurse -Force -File -Depth 6 | Where-Object { $_.Length -gt ($mb * 1MB) -and $_.Extension -notmatch '^\.(ost|pst|vhd|vhdx|vmdk|iso)$' -or ($_.Length -gt ($mb * 1MB) -and $_.Extension -match '^\.(ost|pst|vhd|vhdx|vmdk|iso)$') } | Select-Object -First 100 | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeMB = [math]::Round($_.Length / 1MB); Modified = $_.LastWriteTime; Extension = $_.Extension } } } }
