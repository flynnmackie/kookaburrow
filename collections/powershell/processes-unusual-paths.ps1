$Name = 'Processes - Running From Unusual Locations'
$Description = 'Processes started from user-writable places (Temp, AppData, Downloads, ProgramData, Public, recycle bin) or from a path that does not exist any more.'
$Dependencies = @()
$Tags = @('processes', 'execution', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$bad = 'AppData|\\Temp\\|\\Downloads\\|\\ProgramData\\|\\Users\\Public|\$Recycle\.Bin|\\Windows\\Tasks|\\PerfLogs'
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -match $bad -or -not (Test-Path -LiteralPath $_.ExecutablePath)) } | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Pid = $_.ProcessId; Path = $_.ExecutablePath; Exists = (Test-Path -LiteralPath $_.ExecutablePath); CommandLine = $_.CommandLine; Started = $_.CreationDate } }
