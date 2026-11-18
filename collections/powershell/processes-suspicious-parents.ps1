$Name = 'Processes - Suspicious Parent and Child Pairs'
$Description = 'Processes whose parent is unusual: Office, browsers or PDF readers starting a shell or script host, or a system process with the wrong parent. A strong sign of exploitation.'
$Dependencies = @()
$Tags = @('processes', 'execution', 'malware')

$ErrorActionPreference = 'SilentlyContinue'
$p = Get-CimInstance Win32_Process; $by = @{}; foreach ($x in $p) { $by[[int]$x.ProcessId] = $x }
$apps = 'winword.exe|excel.exe|powerpnt.exe|outlook.exe|msaccess.exe|acrord32.exe|acrobat.exe|chrome.exe|msedge.exe|firefox.exe|iexplore.exe|wmiprvse.exe|w3wp.exe|sqlservr.exe|mshta.exe'
$kids = 'cmd.exe|powershell.exe|pwsh.exe|wscript.exe|cscript.exe|mshta.exe|rundll32.exe|regsvr32.exe|certutil.exe|bitsadmin.exe|msbuild.exe|installutil.exe'
foreach ($x in $p) { $par = $by[[int]$x.ParentProcessId]; if ($par -and $par.Name -match "^($apps)$" -and $x.Name -match "^($kids)$") { [pscustomobject]@{ Reason = 'Application started a shell or script host'; Child = $x.Name; ChildPid = $x.ProcessId; Parent = $par.Name; ParentPid = $par.ProcessId; CommandLine = $x.CommandLine } } }
foreach ($x in $p) { $par = $by[[int]$x.ParentProcessId]; $e = @{ 'lsass.exe' = 'wininit.exe'; 'services.exe' = 'wininit.exe'; 'smss.exe' = 'System'; 'wininit.exe' = 'smss.exe'; 'csrss.exe' = 'smss.exe'; 'winlogon.exe' = 'smss.exe'; 'svchost.exe' = 'services.exe'; 'taskhostw.exe' = 'svchost.exe' }; if ($e.ContainsKey($x.Name) -and $par -and $par.Name -ne $e[$x.Name] -and $x.Name -ne 'csrss.exe' -and $x.Name -ne 'wininit.exe' -and $x.Name -ne 'winlogon.exe') { [pscustomobject]@{ Reason = "Expected parent $($e[$x.Name])"; Child = $x.Name; ChildPid = $x.ProcessId; Parent = $par.Name; ParentPid = $par.ProcessId; CommandLine = $x.CommandLine } } }
