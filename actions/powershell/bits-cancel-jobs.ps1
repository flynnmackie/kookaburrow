$Name = 'BITS - Cancel Jobs'
$Description = 'Cancels BITS transfer jobs for all users, used to stop a payload download or a notify-command persistence job. JobName limits to jobs whose display name contains that text; use all to cancel every job. Each job source and destination is reported.'
$Dependencies = @()
$Parameters = @('JobName')
$Tags = @('persistence', 'c2', 'remediation')

if (-not $JobName) { throw 'JobName is required (part of a name, or all)' }
$jobs = @(Get-BitsTransfer -AllUsers | Where-Object { $JobName -eq 'all' -or $_.DisplayName -like "*$JobName*" })
if (-not $jobs) { Write-Output 'No matching BITS jobs.'; return }
foreach ($j in $jobs) {
    Write-Output "Cancelling $($j.DisplayName) owner $($j.OwnerAccount): $(($j.FileList.RemoteName) -join ', ') -> $(($j.FileList.LocalName) -join ', ')"
    Remove-BitsTransfer -BitsJob $j -ErrorAction Stop
}
