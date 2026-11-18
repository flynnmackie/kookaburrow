$Name = 'System - Page File and Crash Dump Settings'
$Description = 'Page file, crash dump type and automatic reboot settings. Crash dump settings decide what memory evidence survives a crash.'
$Dependencies = @()
$Tags = @('system', 'forensics')

$ErrorActionPreference = 'SilentlyContinue'
$c = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl'
[pscustomobject]@{ Setting = 'CrashDumpEnabled'; Value = $c.CrashDumpEnabled }
[pscustomobject]@{ Setting = 'DumpFile'; Value = $c.DumpFile }
[pscustomobject]@{ Setting = 'AutoReboot'; Value = $c.AutoReboot }
Get-CimInstance Win32_PageFileUsage | ForEach-Object { [pscustomobject]@{ Setting = 'PageFile'; Value = "$($_.Name) $($_.AllocatedBaseSize) MB" } }
