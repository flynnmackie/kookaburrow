$Name = 'Defender - Status'
$Description = 'Reports whether Microsoft Defender is running with real-time and tamper protection, the configured exclusion paths, processes and extensions, and recent threat detections.'
$Dependencies = @()
$Tags = @('defense-evasion', 'antivirus', 'malware')

$ErrorActionPreference = 'SilentlyContinue'

'== Defender status =='
$s = Get-MpComputerStatus
if ($s) {
    $s | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, BehaviorMonitorEnabled, IsTamperProtected,
        AntivirusSignatureLastUpdated, AntivirusSignatureVersion, QuickScanEndTime, FullScanEndTime | Format-List
} else { '(Defender cmdlets unavailable: another antivirus may be in use, or not enough rights)' }

'== Exclusions =='
$p = Get-MpPreference
if ($p) {
    "Paths:      $(@($p.ExclusionPath) -join '; ')"
    "Processes:  $(@($p.ExclusionProcess) -join '; ')"
    "Extensions: $(@($p.ExclusionExtension) -join '; ')"
} else { '(not readable)' }
''
'== Recent threat detections =='
$t = Get-MpThreatDetection
if ($t) {
    $t | Sort-Object InitialDetectionTime -Descending | Select-Object -First 25 InitialDetectionTime, ThreatID, ProcessName, @{ n = 'Resources'; e = { $_.Resources -join '; ' } } | Format-List
} else { '(none)' }
