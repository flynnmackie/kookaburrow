$Name = 'Defender - Remove Exclusion'
$Description = 'Removes a Microsoft Defender exclusion that an attacker (or a mistake) added, so the location, extension or process is scanned again.'
$Dependencies = @()
$Parameters = @('ExclusionType', 'Value')
$Tags = @('antivirus', 'defense-evasion', 'remediation')

$p = Get-MpPreference
$map = @{ Path = 'ExclusionPath'; Extension = 'ExclusionExtension'; Process = 'ExclusionProcess' }
$t = (Get-Culture).TextInfo.ToTitleCase($ExclusionType.ToLower())
if (-not $map.ContainsKey($t)) { throw 'ExclusionType must be Path, Extension or Process' }
$current = @($p.($map[$t]))
Write-Output "Current $t exclusions: $($current -join ' | ')"
if ($Value -notin $current) { throw "No $t exclusion with the value $Value" }
switch ($t) { 'Path' { Remove-MpPreference -ExclusionPath $Value } 'Extension' { Remove-MpPreference -ExclusionExtension $Value } 'Process' { Remove-MpPreference -ExclusionProcess $Value } }
Write-Output "Removed the $t exclusion: $Value"
