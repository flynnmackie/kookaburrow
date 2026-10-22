$Name = 'Persistence - BITS Jobs'
$Description = 'Background Intelligent Transfer Service jobs for all users, with source URL, destination file and any command that runs on completion. BITS is used to download payloads quietly and the notify command gives persistence (like Windows.System.BitsJobs).'
$Dependencies = @()
$Tags = @('persistence', 'c2', 'execution')

$ErrorActionPreference = 'SilentlyContinue'
$jobs = @(Get-BitsTransfer -AllUsers)
if (-not $jobs) { 'No BITS jobs.'; return }
foreach ($j in $jobs) {
    $files = @($j.FileList)
    [pscustomobject]@{ Name = $j.DisplayName; Owner = $j.OwnerAccount; State = $j.JobState; Created = $j.CreationTime; Source = ($files.RemoteName -join '; '); Destination = ($files.LocalName -join '; '); NotifyCommand = ($j.NotifyCmdLineProgram + ' ' + ($j.NotifyCmdLineParameters)).Trim(); Priority = $j.Priority; BytesDone = $j.BytesTransferred }
}
