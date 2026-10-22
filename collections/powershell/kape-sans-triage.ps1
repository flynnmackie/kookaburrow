$Name = 'KAPE - SANS Triage'
$Description = 'Runs KAPE on the host: collects the !SANS_Triage target set (event logs, registry hives, MFT, Prefetch, browser and user artefacts) and parses it with the !EZParser modules. Everything is packed into one zip that comes back as a raw file, then removed from the host. Needs kape.zip: your whole KAPE folder (kape.exe with Targets and Modules, including the EZ Tools under Modules\bin), zipped. Takes a while, and the archive can be several GB, so it comes back over SMB, which is switched on for this collection only. Needs administrator rights and roughly twice the archive size free on the host.'
$Dependencies = @('kape.zip')
$Tags = @('forensics', 'triage', 'filesystem', 'event-logs')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'tool'
$Transfer = 'large'

# $BinDir holds kape.zip (staged by Kookaburrow); $OutDir is the folder that is pulled back afterwards and then removed.
$ErrorActionPreference = 'Stop'
$started = Get-Date

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'KAPE needs an elevated session: the account Kookaburrow uses must be a local administrator'
}

# 1. unpack KAPE next to the staged zip (the whole $BinDir folder is deleted when the run ends)
$kapeDir = Join-Path $BinDir 'kape'
Expand-Archive -LiteralPath (Join-Path $BinDir 'kape.zip') -DestinationPath $kapeDir -Force
$kape = Get-ChildItem -LiteralPath $kapeDir -Recurse -Filter 'kape.exe' -File | Select-Object -First 1
if (-not $kape) { throw 'kape.zip does not contain kape.exe' }
foreach ($need in 'Targets', 'Modules') {
    if (-not (Test-Path -LiteralPath (Join-Path $kape.DirectoryName $need))) { throw "kape.zip has no $need folder next to kape.exe: zip the whole KAPE folder, not just kape.exe" }
}

# 2. collect with the SANS Triage targets, then parse what was collected with the EZParser modules
$work = Join-Path $BinDir 'work'
$tdest = Join-Path $work 'Collected'
$mdest = Join-Path $work 'Parsed'
New-Item -ItemType Directory -Path $work -Force | Out-Null
$log = Join-Path $OutDir 'kape-console.log'
$kapeArgs = @(
    '--tsource', $env:SystemDrive, '--tdest', $tdest, '--tflush', '--target', '!SANS_Triage',
    '--msource', $tdest, '--mdest', $mdest, '--mflush', '--module', '!EZParser'
)
# Start-Process keeps KAPE's console output as plain text in the log (a PowerShell redirect would write UTF-16)
$proc = Start-Process -FilePath $kape.FullName -ArgumentList ($kapeArgs | ForEach-Object { '"' + $_ + '"' }) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $log -RedirectStandardError (Join-Path $work 'kape-stderr.log')
$kapeExit = $proc.ExitCode
if (-not (Test-Path -LiteralPath $tdest) -or -not (Get-ChildItem -LiteralPath $tdest -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    throw "KAPE collected nothing (exit code $kapeExit). See kape-console.log, or run kape.exe by hand on the host to check kape.zip"
}

# 3. one archive for the transfer (zip64, so size is not a limit)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $OutDir ('KAPE_{0}_{1}.zip' -f $env:COMPUTERNAME, $started.ToString('yyyyMMdd_HHmm'))
[System.IO.Compression.ZipFile]::CreateFromDirectory($work, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$files = @(Get-ChildItem -LiteralPath $tdest -Recurse -File -ErrorAction SilentlyContinue).Count
$parsed = @(Get-ChildItem -LiteralPath $mdest -Recurse -File -ErrorAction SilentlyContinue).Count

# what comes back as records
[pscustomobject]@{ Item = 'Archive';          Value = (Split-Path $zip -Leaf) }
[pscustomobject]@{ Item = 'Archive size MB';  Value = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1) }
[pscustomobject]@{ Item = 'Target';           Value = '!SANS_Triage' }
[pscustomobject]@{ Item = 'Module';           Value = '!EZParser' }
[pscustomobject]@{ Item = 'Files collected';  Value = $files }
[pscustomobject]@{ Item = 'Files parsed';     Value = $parsed }
[pscustomobject]@{ Item = 'KAPE exit code';   Value = $kapeExit }
[pscustomobject]@{ Item = 'Minutes';          Value = [math]::Round(((Get-Date) - $started).TotalMinutes, 1) }
