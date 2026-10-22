$Name = 'Files - Archives and Staging'
$Description = 'Large archives and compressed or encrypted bundles (zip, rar, 7z, tar, gz, cab, iso, vhd, pst, ost, bak) created or changed in the last N days (Days, default 14) and bigger than MinSizeMB (default 20), in user folders, ProgramData and temp locations (SearchPath defaults to C:\Users plus C:\ProgramData). Data theft starts with staging data into an archive before it leaves the network.'
$Dependencies = @()
$Parameters = @('Days?', 'MinSizeMB?', 'SearchPath?')
$Tags = @('filesystem', 'forensics', 'c2', 'discovery')

$ErrorActionPreference = 'SilentlyContinue'
$d = if ($Days -match '^\d+$') { [int]$Days } else { 14 }
$mb = if ($MinSizeMB -match '^\d+$') { [int]$MinSizeMB } else { 20 }
$roots = if ($SearchPath) { @($SearchPath) } else { @('C:\Users', "$env:ProgramData", "$env:SystemRoot\Temp") }
$since = (Get-Date).AddDays(-$d)
$ext = '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.cab', '.iso', '.vhd', '.vhdx', '.pst', '.ost', '.bak', '.dmp'
$rows = foreach ($r in $roots) { Get-ChildItem -LiteralPath $r -Recurse -Force -File | Where-Object { $_.Extension.ToLower() -in $ext -and $_.Length -ge ($mb * 1MB) -and ($_.LastWriteTime -ge $since -or $_.CreationTime -ge $since) } }
$rows | Sort-Object Length -Descending | Select-Object -First 500 | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeMB = [math]::Round($_.Length / 1MB, 1); Created = $_.CreationTime; Modified = $_.LastWriteTime; Owner = (Get-Acl -LiteralPath $_.FullName).Owner } }
