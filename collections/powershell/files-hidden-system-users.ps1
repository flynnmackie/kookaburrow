$Name = 'Files - Hidden and System Files in User Folders'
$Description = 'Files with the hidden or system attribute in user folders and the root of the system drive. Attackers hide payloads this way.'
$Dependencies = @()
$Tags = @('filesystem', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($u in (Get-ChildItem "$env:SystemDrive\Users" -Directory)) { Get-ChildItem $u.FullName -Recurse -Force -File -Depth 3 | Where-Object { ($_.Attributes -band [IO.FileAttributes]::Hidden) -and ($_.Attributes -band [IO.FileAttributes]::System) -and $_.Name -ne 'desktop.ini' -and $_.Name -ne 'ntuser.dat' -and $_.Name -notmatch '^(NTUSER|ntuser|UsrClass)' } | Select-Object -First 100 | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB, 1); Modified = $_.LastWriteTime; Attributes = "$($_.Attributes)" } } }
Get-ChildItem "$env:SystemDrive\" -Force -File | Where-Object { $_.Name -notmatch '^(pagefile|hiberfil|swapfile)\.sys$' } | ForEach-Object { [pscustomobject]@{ Path = $_.FullName; SizeKB = [math]::Round($_.Length / 1KB, 1); Modified = $_.LastWriteTime; Attributes = "$($_.Attributes)" } }
