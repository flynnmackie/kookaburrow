$Name = 'Memory - Full Dump'
$Description = 'Acquires all physical memory (RAM) as a raw image with WinPmem, for analysis with Volatility or MemProcFS. The image is as large as the installed RAM, so the host needs at least that much free disk space and the transfer can take a long time and many GB. Needs the winpmem.exe single-file binary uploaded under Settings, Binaries (use the winpmem mini x64 build, renamed to winpmem.exe). Needs administrator rights. Comes back over SMB, which is switched on for this collection only.'
$Dependencies = @('winpmem.exe')
$Tags = @('forensics', 'malware', 'processes')
$Footprint = 'transient'
$Returns = 'both'
$Type = 'tool'
$Transfer = 'large'

$ErrorActionPreference = 'Stop'
$exe = Join-Path $BinDir 'winpmem.exe'
$ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$free = (Get-PSDrive -Name ((Split-Path $OutDir -Qualifier).TrimEnd(':'))).Free
if ($free -lt ($ram * 1.05)) { throw "Not enough free disk space for the image: RAM is $([math]::Round($ram / 1GB, 1)) GB, $([math]::Round($free / 1GB, 1)) GB free on the host" }
$img = Join-Path $OutDir 'memory.raw'
$started = Get-Date
$o = & $exe $img 2>&1 | Out-String
if (-not (Test-Path -LiteralPath $img)) { throw "WinPmem produced no image: $($o.Trim())" }
[pscustomobject]@{ Image = 'memory.raw'; SizeGB = [math]::Round((Get-Item -LiteralPath $img).Length / 1GB, 2); RamGB = [math]::Round($ram / 1GB, 2); Minutes = [math]::Round(((Get-Date) - $started).TotalMinutes, 1) }
