$Name = 'Registry - Export Key'
$Description = 'Exports a registry key (and everything below it) to a .reg file that comes back to the server. KeyPath is the full key, for example HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run or HKU\S-1-5-21-...\Software. Use it to preserve a persistence key or a vendor configuration exactly as it was. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Parameters = @('KeyPath')
$Tags = @('registry', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

$ErrorActionPreference = 'Stop'
if ($KeyPath -notmatch '^(HKLM|HKCU|HKU|HKCR|HKCC|HKEY_[A-Z_]+)\\') { throw 'KeyPath must start with HKLM\, HKCU\, HKU\, HKCR\ or HKCC\' }
$dst = Join-Path $OutDir (($KeyPath -replace '[\\/:*?"<>|]', '_') + '.reg')
$o = reg export $KeyPath $dst /y 2>&1
if (-not (Test-Path -LiteralPath $dst)) { throw "Could not export $KeyPath : $($o | Out-String)" }
[pscustomobject]@{ Key = $KeyPath; File = (Split-Path $dst -Leaf); SizeBytes = (Get-Item -LiteralPath $dst).Length }
