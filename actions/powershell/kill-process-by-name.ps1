$Name = 'Processes - Kill by Name'
$Description = 'Stops every running process with the given image name (for example evil.exe) and reports what was stopped.'
$Dependencies = @()
$Parameters = @('ProcessName')
$Tags = @('containment', 'process')

if (-not $ProcessName -or $ProcessName -match '[\*\?]') { throw 'ProcessName is required and must not contain wildcards' }
$name = [IO.Path]::GetFileNameWithoutExtension($ProcessName)
$procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
if (-not $procs) { Write-Output "No process named '$name' is running."; return }
foreach ($p in $procs) {
    $path = try { $p.Path } catch { '' }
    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Output "Stopped PID $($p.Id) $($p.ProcessName) $path" }
    catch { Write-Output "FAILED PID $($p.Id) $($p.ProcessName): $($_.Exception.Message)" }
}
