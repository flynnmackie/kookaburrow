$Name = 'System - Printers and Print Drivers'
$Description = 'Installed printers, their drivers and ports, and the print spooler state. Malicious drivers and ports are a persistence and privilege escalation route.'
$Dependencies = @()
$Tags = @('inventory', 'persistence', 'privilege-escalation')

$ErrorActionPreference = 'SilentlyContinue'
$spool = (Get-Service Spooler).Status
Get-Printer | ForEach-Object { [pscustomobject]@{ Printer = $_.Name; Driver = $_.DriverName; Port = $_.PortName; Shared = $_.Shared; Spooler = "$spool" } }
Get-PrinterDriver | ForEach-Object { [pscustomobject]@{ Printer = '(driver)'; Driver = $_.Name; Port = $_.Manufacturer; Shared = ''; Spooler = "$spool" } }
