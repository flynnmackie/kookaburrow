$Name = 'Yara - Scan Processes'
$Description = 'Scans the memory of running processes with YARA rules and returns the processes that match and which rule matched. ProcessName limits the scan to processes with that name (wildcards allowed, for example power*); with nothing set every process is scanned, which can take a while. The rules come from the kb-rules.yar file you upload under Settings, Binaries, and the yara64.exe single-file binary must be uploaded there too. Needs administrator rights.'
$Dependencies = @('yara64.exe', 'kb-rules.yar')
$Parameters = @('ProcessName?')
$Tags = @('malware', 'processes', 'forensics')
$Footprint = 'transient'
$Returns = 'records'
$Type = 'tool'

$ErrorActionPreference = 'SilentlyContinue'
$exe = Join-Path $BinDir 'yara64.exe'
$rules = Join-Path $BinDir 'kb-rules.yar'
$procs = Get-Process | Where-Object { $_.Id -gt 4 -and (-not $ProcessName -or $_.ProcessName -like $ProcessName -or "$($_.ProcessName).exe" -like $ProcessName) }
$hits = 0
foreach ($p in $procs) {
    foreach ($l in (& $exe -w -N $rules $p.Id 2>&1)) {
        if ($l -match '^(\S+)\s+(\d+)\s*$') { $hits++; [pscustomobject]@{ Rule = $Matches[1]; Pid = $p.Id; Process = $p.ProcessName; Path = $p.Path } }
    }
}
if (-not $hits) { "No YARA matches in $(@($procs).Count) process(es)." }
