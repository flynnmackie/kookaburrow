$Name = 'Deploy - Velociraptor (Windows)'
$Description = 'Installs the Velociraptor client on the host from your own client MSI (the repackaged installer that already contains your server address and certificates). Needs administrator rights.'
$Dependencies = @('velociraptor-client.msi')
$Parameters = @()
$Tags = @('deploy', 'velociraptor', 'agent', 'persistence')

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'This needs an elevated session: the account Kookaburrow uses must be a local administrator' }
$msi = Join-Path $BinDir 'velociraptor-client.msi'
if (-not (Test-Path -LiteralPath $msi)) { throw 'velociraptor-client.msi was not staged on the host' }

$existing = Get-Service -Name 'Velociraptor*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) { Write-Output "A Velociraptor service is already installed ($($existing.Name), $($existing.Status)). Nothing was changed."; return }

$hash = (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLower()
Write-Output "Installer: velociraptor-client.msi, SHA-256 $hash"

# the installer is run by SYSTEM from a folder SYSTEM can read (the temporary folder belongs to the remote session's user)
$stage = Join-Path $env:ProgramData 'Kookaburrow\deploy-velociraptor'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$task = 'Kookaburrow Velociraptor install'
try {
    Copy-Item -LiteralPath $msi -Destination (Join-Path $stage 'velociraptor-client.msi') -Force
    $log = Join-Path $stage 'install.log'
    $action = New-ScheduledTaskAction -Execute 'msiexec.exe' -Argument ('/i "{0}" /quiet /norestart /l*v "{1}"' -f (Join-Path $stage 'velociraptor-client.msi'), $log)
    Register-ScheduledTask -TaskName $task -Action $action -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Start-ScheduledTask -TaskName $task
    Write-Output 'Installing the MSI as SYSTEM (scheduled task)'
    # wait for the installer to finish (up to 5 minutes)
    $deadline = (Get-Date).AddMinutes(5)
    Start-Sleep -Seconds 3
    while ((Get-ScheduledTask -TaskName $task).State -eq 'Running' -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
    $result = (Get-ScheduledTaskInfo -TaskName $task).LastTaskResult
    Write-Output "Installer exit code: $result"
    # the service can take a moment to register and start
    $svc = $null
    for ($i = 0; $i -lt 12; $i++) {
        $svc = Get-Service -Name 'Velociraptor*' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($svc -and $svc.Status -eq 'Running') { break }
        Start-Sleep -Seconds 5
    }
    if ($svc -and $svc.Status -eq 'Running') {
        Write-Output "Velociraptor is installed and running (service $($svc.Name))"
    } else {
        if (Test-Path -LiteralPath $log) { Write-Output '--- last lines of the installer log ---'; Get-Content -LiteralPath $log -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_ } }
        throw "Velociraptor is not running afterwards (service: $(if ($svc) { $svc.Status } else { 'not found' }), installer exit code $result)"
    }
} finally {
    Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
