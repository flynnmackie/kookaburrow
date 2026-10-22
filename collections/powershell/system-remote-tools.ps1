$Name = 'Software - Remote Access Tools'
$Description = 'Looks for common remote access and remote management tools (AnyDesk, TeamViewer, ScreenConnect, Splashtop, RustDesk, LogMeIn, VNC, Atera, NinjaOne and similar) in installed software, services, running processes and well-known folders. Legitimate IT tools are heavily abused for access and persistence.'
$Dependencies = @()
$Tags = @('c2', 'persistence', 'lateral-movement', 'software')

$ErrorActionPreference = 'SilentlyContinue'
$pattern = 'anydesk|teamviewer|screenconnect|connectwise|splashtop|rustdesk|logmein|gotoassist|gotomypc|vnc|atera|ninjarmm|ninjaone|action1|meshagent|mesh central|zoho assist|supremo|ultraviewer|remotepc|dwservice|dameware|radmin|ammyy|netsupport|bomgar|beyondtrust|kaseya|n-able|syncro|level\.io|tailscale|ngrok|chrome remote'
Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -match $pattern } | ForEach-Object { [pscustomobject]@{ Source = 'Installed'; Name = $_.DisplayName; Detail = "$($_.DisplayVersion) $($_.InstallLocation)" } }
Get-CimInstance Win32_Service | Where-Object { "$($_.Name) $($_.DisplayName) $($_.PathName)" -match $pattern } | ForEach-Object { [pscustomobject]@{ Source = 'Service'; Name = $_.Name; Detail = "$($_.State) $($_.PathName)" } }
Get-CimInstance Win32_Process | Where-Object { "$($_.Name) $($_.ExecutablePath)" -match $pattern } | ForEach-Object { [pscustomobject]@{ Source = 'Process'; Name = $_.Name; Detail = "PID $($_.ProcessId) $($_.ExecutablePath)" } }
foreach ($d in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData, 'C:\Users')) {
    Get-ChildItem -LiteralPath $d -Directory -Force -Depth 2 | Where-Object { $_.Name -match $pattern } | ForEach-Object { [pscustomobject]@{ Source = 'Folder'; Name = $_.Name; Detail = $_.FullName } }
}
