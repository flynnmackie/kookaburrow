$Name = 'Short title of the collection'
$Description = 'One or two sentences on what this collection looks for and why it matters.'
$Dependencies = @()
$Tags = @('persistence', 'registry')
$Footprint = 'none'
$Returns = 'records'
$Type = 'command'
$Transfer = 'none'

# ----------------------------------------------------------------------------
# COLLECTION TEMPLATE (PowerShell) - copy to collections/powershell/<your-collection>.ps1
#
# Metadata (the variables above)
#   * $Footprint, $Returns and $Type are optional; say what the collection does so analysts know before running it.
#       $Footprint  none       runs only what is already on the host
#                   transient  stages a tool or temp files and removes them afterwards
#                   persistent leaves something behind or changes the host (belongs in Respond, not here)
#       $Returns    records    rows of text/data from the script output (CSV and JSON in the hunt evidence)
#                   files      raw artefacts pulled and hashed into evidence
#                   both
#       $Type       command    runs a command on the host and captures its output
#                   artefact   collects existing files such as event logs or Prefetch
#                   tool       deploys a binary from $Dependencies and returns its output
#     When left out they are worked out: dependencies means tool + transient, otherwise command + none + records.
#   * $Transfer is optional: 'large' for a collection that leaves big files (a KAPE run, exported logs) for the server to pull back.
#       The script writes them to $OutDir, a temporary folder on the host. Afterwards Kookaburrow pulls everything in it into the
#       hunt's raw folder (over SMB for Windows hosts, which is switched on for this hunt only and closed again; over SFTP for Linux),
#       checks each file's SHA-256 against the host's, then removes the folder. The hunter is warned before the hunt runs.
#       See event-logs-export.ps1 for a working example. Leave it out or use 'none' for normal collections.
#   * $Name, $Description, $Dependencies and $Tags must be the first statements in the file.
#     Comments and blank lines may sit between them; the first other line starts the collection.
#   * Each value must be a plain literal. The platform reads them as text and never runs
#     the script to do so, so expressions and other variables are not evaluated.
#   * Use single quotes; write a literal apostrophe as two ('').
#   * $Dependencies lists external binaries the collection needs that are NOT part of a standard
#     Windows install, for example @('sigcheck.exe', 'autorunsc.exe'). Standard cmdlets and
#     modules do not count. Use @() when there are none.
#   * The hunter supplies each dependency by placing it in the platform's binaries folder
#     (matched by file name). On every run the platform copies them to a temporary folder on
#     the target, sets $BinDir to that folder before your script starts, and deletes it
#     afterwards. Use it like: $tool = Join-Path $BinDir 'autorunsc.exe'
#     See autoruns-unsigned.ps1 for a working example.
#   * $Tags are short lowercase labels used to filter collections in the UI, for example
#     @('persistence', 'wmi'). Reuse existing tags where you can. Common ones: persistence,
#     execution, defense-evasion, lateral-movement, privilege-escalation, discovery, accounts,
#     logons, network, c2, event-logs, filesystem, malware, inventory, forensics. Use @() for none.
#
# Collection (everything after the metadata)
#   * Runs remotely with Invoke-Command (WinRM) or piped to powershell/pwsh (SSH).
#   * Write results to the output stream (Format-Table / Format-List / Write-Output).
#   * Collections must leave nothing behind: do not change the host. Anything staged must be removed again.
# ----------------------------------------------------------------------------

'== Section title =='
Get-Process | Select-Object Id, ProcessName, Path | Sort-Object Id | Format-Table -AutoSize
