$Name = 'PowerShell - Transcripts and Script Logs'
$Description = 'PowerShell transcript and log folders, the execution policy at each scope and the installed PowerShell versions (v2 downgrade is a known evasion).'
$Dependencies = @()
$Tags = @('powershell', 'defense-evasion', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
Get-ExecutionPolicy -List | ForEach-Object { [pscustomobject]@{ Item = "ExecutionPolicy $($_.Scope)"; Value = "$($_.ExecutionPolicy)" } }
[pscustomobject]@{ Item = 'PowerShell v2 feature'; Value = (Get-WindowsOptionalFeature -Online -FeatureName MicrosoftWindowsPowerShellV2Root).State }
[pscustomobject]@{ Item = 'This session version'; Value = "$($PSVersionTable.PSVersion)" }
foreach ($d in "$env:USERPROFILE\Documents", "$env:SystemDrive\Transcripts", "$env:ProgramData\PSTranscripts") { $n = @(Get-ChildItem $d -Directory | Where-Object { $_.Name -match '^\d{8}$' } | ForEach-Object { Get-ChildItem $_.FullName -Filter 'PowerShell_transcript*' -File }).Count; if ($n) { [pscustomobject]@{ Item = "Transcripts in $d"; Value = $n } } }
