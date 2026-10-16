$Name = 'Persistence - Run keys and scheduled tasks'
$Description = 'Registry Run/RunOnce entries and non-Microsoft scheduled tasks (Windows).'
$Dependencies = @()
$Tags = @('persistence', 'registry', 'scheduled-tasks')

'== Registry Run keys =='
$keys = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
foreach ($k in $keys) {
    if (Test-Path $k) {
        "[$k]"
        (Get-ItemProperty $k).PSObject.Properties |
            Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { "  $($_.Name) = $($_.Value)" }
    }
}
''
'== Scheduled tasks (non-Microsoft) =='
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } |
    Select-Object TaskPath, TaskName, State,
        @{n='Actions';e={ ($_.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join '; ' }} |
    Format-List
