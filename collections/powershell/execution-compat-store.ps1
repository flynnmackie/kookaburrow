$Name = 'Execution - Program Compatibility Assistant'
$Description = 'Programs recorded by the Program Compatibility Assistant and its persisted store, which keeps the path of programs that ran even after they were deleted.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { foreach ($sub in 'Persisted', 'Store') { $k = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Compatibility Assistant\$sub"; $p = Get-ItemProperty $k; foreach ($n in ($p.PSObject.Properties | Where-Object { $_.Name -match '^[A-Za-z]:\\' })) { [pscustomobject]@{ Sid = $root.PSChildName; Source = $sub; Program = $n.Name } } } }
