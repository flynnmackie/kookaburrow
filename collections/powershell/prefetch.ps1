$Name = 'Prefetch - List'
$Description = 'Lists Windows Prefetch files, which record that a program ran, with an approximate first and last run time from the file timestamps. Needs administrator rights.'
$Dependencies = @()
$Tags = @('execution', 'forensics', 'filesystem')

$ErrorActionPreference = 'SilentlyContinue'
$dir = "$env:SystemRoot\Prefetch"

$files = Get-ChildItem -LiteralPath $dir -Filter '*.pf' -Force
if (-not $files) {
    $enabled = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters').EnablePrefetcher
    "No Prefetch files readable in $dir (EnablePrefetcher = $enabled; 0 means disabled). Administrator rights are required."
    return
}

"$(@($files).Count) Prefetch file(s), most recently run first"
''
$files | Sort-Object LastWriteTime -Descending | Select-Object -First 150 |
    Select-Object @{ n = 'LastRun(approx)'; e = { $_.LastWriteTime } }, @{ n = 'FirstSeen(approx)'; e = { $_.CreationTime } }, Name, Length |
    Format-Table -AutoSize
