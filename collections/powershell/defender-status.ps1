$Name = 'Defender - Status'
$Description = 'Reports whether Microsoft Defender is running with real-time and tamper protection, the configured exclusion paths, processes and extensions, and recent threat detections.'
$Dependencies = @()
$Tags = @('defense-evasion', 'antivirus', 'malware')
$DiffIgnore = @('Detail')

$ErrorActionPreference = 'SilentlyContinue'

# One row per setting, exclusion and detection. Kind says which; Detail holds what changes on its own (signature versions, scan and
# detection times), so comparing two runs shows protection being turned off or an exclusion being added, not a daily update.
function Row($kind, $name, $value, $detail) { [pscustomobject]@{ Kind = $kind; Name = $name; Value = "$value"; Detail = "$detail" } }

$s = Get-MpComputerStatus
if ($s) {
    foreach ($n in 'AMServiceEnabled', 'AntivirusEnabled', 'RealTimeProtectionEnabled', 'BehaviorMonitorEnabled', 'IsTamperProtected') { Row 'Status' $n $s.$n '' }
    foreach ($n in 'AntivirusSignatureVersion', 'AntivirusSignatureLastUpdated', 'QuickScanEndTime', 'FullScanEndTime') { Row 'Updates and scans' $n '' $s.$n }
} else { Row 'Note' 'Defender' 'unavailable' 'The Defender cmdlets did not answer: another antivirus may be in use, or not enough rights' }

$p = Get-MpPreference
if ($p) {
    foreach ($x in @($p.ExclusionPath)) { if ($x) { Row 'Exclusion' 'Path' $x '' } }
    foreach ($x in @($p.ExclusionProcess)) { if ($x) { Row 'Exclusion' 'Process' $x '' } }
    foreach ($x in @($p.ExclusionExtension)) { if ($x) { Row 'Exclusion' 'Extension' $x '' } }
}

Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending | Select-Object -First 25 | ForEach-Object {
    Row 'Detection' "Threat $($_.ThreatID) ($($_.ProcessName))" ($_.Resources -join '; ') $_.InitialDetectionTime
}
