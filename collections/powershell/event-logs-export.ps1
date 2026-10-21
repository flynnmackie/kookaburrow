$Name = 'Event logs export (large transfer)'
$Description = 'Exports the Security, System and Application event logs as .evtx files and pulls them back to the server, for analysis in a tool such as Event Log Explorer or Hayabusa. The files can be hundreds of MB, so they come back over SMB, which is switched on for this collection only.'
$Dependencies = @()
$Tags = @('event-logs', 'forensics')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'artefact'
$Transfer = 'large'

# $OutDir is the temporary folder on the host that Kookaburrow pulls back afterwards and then removes.
$ErrorActionPreference = 'Stop'
foreach ($log in 'Security', 'System', 'Application') {
    wevtutil epl $log (Join-Path $OutDir "$log.evtx") /ow:true
    if ($LASTEXITCODE -ne 0) { throw "wevtutil could not export the $log log (exit code $LASTEXITCODE)" }
}
Get-ChildItem -LiteralPath $OutDir -File | Select-Object Name, Length | Format-Table -AutoSize
