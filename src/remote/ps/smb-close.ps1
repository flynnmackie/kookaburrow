# Large transfers, last step: remove the folder, put the SMB service and firewall rule back, and report what is in place now.
# Run on the target by src/remote/winrm_helper.py with $arg set to the request (a JSON object). Same steps as the PowerShell remoting path.
$outDir = [string]$arg.outDir; $state = $arg.state; $removeDir = [bool]$arg.removeDir
$res = [ordered]@{ outDirRemoved = $null; errors = @() }
if ($outDir -and $removeDir -and $outDir -like '*\kb-out-*') {
    Remove-Item -LiteralPath $outDir -Recurse -Force -ErrorAction SilentlyContinue
    $res.outDirRemoved = -not (Test-Path -LiteralPath $outDir)
}
try {
    if ($state.createdRule) { Remove-NetFirewallRule -Name 'KB-SMB-Temp' -ErrorAction SilentlyContinue }
    elseif ($state.ruleChanged) {
        Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -Enabled False
        $was = @($state.ruleRemote); if (-not $was.Count) { $was = @('Any') }
        Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -RemoteAddress $was
    }
    if (-not $state.serviceRunning) { Stop-Service LanmanServer -Force -ErrorAction Stop }
    if ($state.serviceStartMode -eq 'Disabled') { Set-Service LanmanServer -StartupType Disabled }
} catch { $res.errors += $_.Exception.Message }
$r = Get-NetFirewallRule -Name 'FPS-SMB-In-TCP' -ErrorAction SilentlyContinue
$res.serviceRunning = ((Get-Service LanmanServer).Status -eq 'Running')
$res.ruleEnabled = [bool]($r -and $r.Enabled -eq 'True')
$res.tempRulePresent = [bool](Get-NetFirewallRule -Name 'KB-SMB-Temp' -ErrorAction SilentlyContinue)
ConvertTo-Json -InputObject $res -Compress
