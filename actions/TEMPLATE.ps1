$Name = 'Short title of the action'
$Description = 'One or two sentences on what this action changes on the host and when to use it.'
$Dependencies = @()
$Parameters = @('ExampleInput')
$Tags = @('containment', 'process')

# ----------------------------------------------------------------------------
# ACTION TEMPLATE (PowerShell) - copy to actions/powershell/<your-action>.ps1
#
# An action is a script that CHANGES the host (kill a process, create a user, block an address...).
# It is written like a hunt (see hunts/TEMPLATE.ps1) with one extra metadata variable.
#
# Metadata
#   * $Name, $Description, $Dependencies, $Parameters and $Tags must be the first statements in
#     the file. Each value is a plain literal; the platform reads them as text and never runs
#     the script to do so. Use single quotes; write a literal apostrophe as two ('').
#   * $Dependencies: external binaries the action needs (see the hunt template). @() for none.
#   * $Parameters: the names of the inputs the action needs, for example @('ProcessName').
#     The platform will define a variable of the same name ($ProcessName) before the script
#     starts, so use it directly. Use @() when the action needs no input. (Entering values and
#     running actions is not wired up yet.)
#   * $Tags: short lowercase labels. Common ones: containment, process, accounts, network,
#     firewall, services, persistence, remediation, filesystem.
#
# Action (everything after the metadata)
#   * Check every parameter first and stop with 'throw' if it is empty or invalid.
#   * Print what was changed (or what would be, see below), so the output is the audit record.
#   * Be as narrow as possible: act on exactly what the parameters name, never on a wildcard
#     the operator did not give.
# ----------------------------------------------------------------------------
if (-not $ExampleInput) { throw 'ExampleInput is required' }
Write-Output "Would act on: $ExampleInput"
