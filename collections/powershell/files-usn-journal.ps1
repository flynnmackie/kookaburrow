$Name = 'Files - USN Journal'
$Description = 'Recent file system changes from the NTFS USN change journal: file created, deleted, renamed, overwritten and the time of each. Shows what happened to files even after they were deleted. ReadMB is how much of the end of the journal to read (default 20 MB, roughly 200000 records); Contains keeps only file names containing that text; LastMinutes keeps only changes in the last N minutes; Drive defaults to C:. Needs administrator rights (like Windows.Forensics.Usn).'
$Dependencies = @()
$Parameters = @('Drive?', 'Contains?', 'LastMinutes?', 'ReadMB?')
$Tags = @('filesystem', 'forensics', 'defense-evasion')

$ErrorActionPreference = 'SilentlyContinue'
$drive = if ($Drive) { $Drive.TrimEnd('\') } else { 'C:' }
$mb = if ($ReadMB -match '^\d+$') { [int]$ReadMB } else { 20 }
$q = (fsutil usn queryjournal $drive) -join ' '
if ($q -notmatch 'Next Usn\s*:\s*(0x[0-9a-fA-F]+)') { throw "No USN journal on $drive (or administrator rights are needed)" }
$next = [Convert]::ToInt64($Matches[1], 16)
$first = if ($q -match 'First Usn\s*:\s*(0x[0-9a-fA-F]+)') { [Convert]::ToInt64($Matches[1], 16) } else { 0 }
$start = [Math]::Max($first, $next - ([int64]$mb * 1MB))
# reading must begin on a record boundary, which is not known, so step forward in 8-byte units until fsutil accepts the position
$out = $null
for ($i = 0; $i -lt 2000; $i++) {
    $s = $start + 8 * $i
    $out = @(fsutil usn readjournal $drive startusn=$s csv 2>&1)
    if ($LASTEXITCODE -eq 0 -and ($out | Where-Object { $_ -like 'Usn,File name,*' })) { break }
    $out = $null
}
if (-not $out) { throw 'Could not read the USN journal (no valid starting position found)' }
$h = [array]::IndexOf($out, ($out | Where-Object { $_ -like 'Usn,File name,*' } | Select-Object -First 1))
$since = if ($LastMinutes -match '^\d+$') { (Get-Date).AddMinutes(-[int]$LastMinutes) } else { [datetime]::MinValue }
$rows = $out[$h..($out.Count - 1)] | ConvertFrom-Csv
foreach ($r in $rows) {
    $t = [datetime]::MinValue
    [void][datetime]::TryParse($r.'Time stamp', [ref]$t)
    if ($t -lt $since) { continue }
    if ($Contains -and $r.'File name' -notlike "*$Contains*") { continue }
    [pscustomobject]@{ Time = $r.'Time stamp'; FileName = $r.'File name'; Reason = $r.Reason; FileAttributes = $r.'File attributes'; FileId = $r.'File ID'; ParentId = $r.'Parent file ID'; Usn = $r.Usn }
}
