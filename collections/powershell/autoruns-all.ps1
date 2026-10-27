$Name = 'Autoruns - All Entries'
$Description = 'Every autostart location Sysinternals Autoruns knows about.'
$Dependencies = @('autorunsc.exe')
$Parameters = @('HideMicrosoft?')
$Tags = @('persistence', 'autoruns', 'signing')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'autorunsc.exe'
$args2 = @('-accepteula', '-nobanner', '-a', '*', '-c', '-h', '-s')
if ($HideMicrosoft -match '^(y|yes|true|1)$') { $args2 += '-m' }
$csv = & $exe @args2 2>$null
$rows = $csv | ConvertFrom-Csv
if (-not $rows) { throw 'autorunsc returned nothing (administrator rights are required)' }
$rows | ForEach-Object { [pscustomobject]@{ Location = $_.'Entry Location'; Entry = $_.Entry; Enabled = $_.Enabled; Category = $_.Category; Profile = $_.Profile; Description = $_.Description; Signer = $_.Signer; Company = $_.Company; ImagePath = $_.'Image Path'; Version = $_.Version; LaunchString = $_.'Launch String'; Sha256 = $_.'SHA-256'; Md5 = $_.MD5; Time = $_.Time } }
