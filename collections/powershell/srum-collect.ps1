$Name = 'SRUM - Collect'
$Description = 'Copies the System Resource Usage Monitor database (SRUDB.dat) and the SOFTWARE hive it needs for parsing. Needs administrator rights.'
$Dependencies = @()
$Tags = @('forensics', 'execution', 'network')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'SilentlyContinue'
$src = "$env:SystemRoot\System32\sru\SRUDB.dat"
$dst = Join-Path $OutDir 'SRUDB.dat'
$null = esentutl.exe /y $src /vss /d $dst 2>&1
if (-not (Test-Path -LiteralPath $dst)) { $null = esentutl.exe /y $src /d $dst 2>&1 }
if (-not (Test-Path -LiteralPath $dst)) { throw 'SRUDB.dat could not be copied (administrator rights are required)' }
[pscustomobject]@{ File = 'SRUDB.dat'; SizeBytes = (Get-Item -LiteralPath $dst).Length; Source = $src }
$null = reg save 'HKLM\SOFTWARE' (Join-Path $OutDir 'SOFTWARE') /y 2>&1
[pscustomobject]@{ File = 'SOFTWARE'; SizeBytes = (Get-Item -LiteralPath (Join-Path $OutDir 'SOFTWARE')).Length; Source = 'HKLM\SOFTWARE (reg save)' }
