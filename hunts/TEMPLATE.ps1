$Name = 'Short title of the hunt'
$Description = 'One or two sentences on what this hunt looks for and why it matters.'
$Dependencies = @()
$Tags = @('persistence', 'registry')

# ----------------------------------------------------------------------------
# HUNT TEMPLATE (PowerShell) - copy to hunts/powershell/<your-hunt>.ps1
#
# Metadata (the three variables above)
#   * $Name, $Description, $Dependencies and $Tags must be the first statements in the file.
#     Comments and blank lines may sit between them; the first other line starts the hunt.
#   * Each value must be a plain literal. The platform reads them as text and never runs
#     the script to do so, so expressions and other variables are not evaluated.
#   * Use single quotes; write a literal apostrophe as two ('').
#   * $Dependencies lists external binaries the hunt needs that are NOT part of a standard
#     Windows install, for example @('sigcheck.exe', 'autorunsc.exe'). Standard cmdlets and
#     modules do not count. Use @() when there are none.
#   * The hunter supplies each dependency by placing it in the platform's binaries folder
#     (matched by file name). On every run the platform copies them to a temporary folder on
#     the target, sets $BinDir to that folder before your script starts, and deletes it
#     afterwards. Use it like: $tool = Join-Path $BinDir 'autorunsc.exe'
#     See autoruns-unsigned.ps1 for a working example.
#   * $Tags are short lowercase labels used to filter hunts in the UI, for example
#     @('persistence', 'wmi'). Reuse existing tags where you can. Common ones: persistence,
#     execution, defense-evasion, lateral-movement, privilege-escalation, discovery, accounts,
#     logons, network, c2, event-logs, filesystem, malware, inventory, forensics. Use @() for none.
#
# Hunt (everything after the metadata)
#   * Runs remotely with Invoke-Command (WinRM) or piped to powershell/pwsh (SSH).
#   * Write results to the output stream (Format-Table / Format-List / Write-Output).
#   * Hunts should be read-only: do not change, install or delete anything on the target.
# ----------------------------------------------------------------------------

'== Section title =='
Get-Process | Select-Object Id, ProcessName, Path | Sort-Object Id | Format-Table -AutoSize
