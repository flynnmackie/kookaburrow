$Name = 'Persistence - Run Keys and Tasks'
$Description = 'Registry Run/RunOnce entries and non-Microsoft scheduled tasks (Windows).'
$Dependencies = @()
$Tags = @('persistence', 'registry', 'scheduled-tasks')

# One row per Run/RunOnce value (Kind Run key) and per scheduled task outside \Microsoft\ (Kind Scheduled task).
$keys = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
foreach ($k in $keys) {
    if (Test-Path $k) {
        (Get-ItemProperty $k).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
            [pscustomobject]@{ Kind = 'Run key'; Location = $k; Name = $_.Name; Command = "$($_.Value)"; State = '' }
        }
    }
}
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    [pscustomobject]@{ Kind = 'Scheduled task'; Location = $_.TaskPath; Name = $_.TaskName
        Command = (($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)".Trim() }) -join '; '); State = "$($_.State)" }
}
