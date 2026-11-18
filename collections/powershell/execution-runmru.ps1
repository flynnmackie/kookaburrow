$Name = 'Execution - Run Dialog and Typed Paths'
$Description = 'Commands typed in the Run dialog (RunMRU) and paths typed in Explorer (TypedPaths), for every logged-on user.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'registry')

$ErrorActionPreference = 'SilentlyContinue'
foreach ($root in (Get-ChildItem Registry::HKEY_USERS | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) { $b = "Registry::HKEY_USERS\$($root.PSChildName)\Software\Microsoft\Windows\CurrentVersion\Explorer"
 $r = Get-ItemProperty "$b\RunMRU"; foreach ($n in ($r.PSObject.Properties | Where-Object { $_.Name -match '^[a-z]$' })) { [pscustomobject]@{ Sid = $root.PSChildName; Kind = 'RunMRU'; Entry = ($n.Value -replace '\\1$', '') } }
 $t = Get-ItemProperty "$b\TypedPaths"; foreach ($n in ($t.PSObject.Properties | Where-Object { $_.Name -like 'url*' })) { [pscustomobject]@{ Sid = $root.PSChildName; Kind = 'TypedPath'; Entry = $n.Value } } }
