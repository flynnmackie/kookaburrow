$Name = 'Defender - Scan'
$Description = 'Starts a Microsoft Defender scan and waits for it to finish. ScanType is Quick (default), Full or Custom; Custom needs ScanPath (a file or folder). Detections are reported afterwards. A full scan can take hours, so the run may time out while the scan carries on in the background.'
$Dependencies = @()
$Parameters = @('ScanType?', 'ScanPath?')
$Tags = @('antivirus', 'malware', 'remediation')

$t = if ($ScanType) { (Get-Culture).TextInfo.ToTitleCase($ScanType.ToLower()) } else { 'Quick' }
if ($t -notin 'Quick', 'Full', 'Custom') { throw 'ScanType must be Quick, Full or Custom' }
$start = Get-Date
if ($t -eq 'Custom') { if (-not $ScanPath) { throw 'ScanPath is required for a Custom scan' }; Start-MpScan -ScanType CustomScan -ScanPath $ScanPath -ErrorAction Stop }
else { Start-MpScan -ScanType "$($t)Scan" -ErrorAction Stop }
Write-Output "$t scan finished after $([math]::Round(((Get-Date) - $start).TotalMinutes, 1)) minutes."
$d = @(Get-MpThreatDetection | Where-Object { $_.InitialDetectionTime -ge $start })
if ($d) { $d | ForEach-Object { Write-Output "Detection: $($_.ThreatID) $(($_.Resources) -join ', ') status $($_.ThreatStatusID)" } } else { Write-Output 'No new detections.' }
