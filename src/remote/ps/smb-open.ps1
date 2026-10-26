# Large transfers, step 1: make SMB reachable from the Kookaburrow server and create the folder the collection writes to.
# Run on the target by src/remote/winrm_helper.py with $arg set to the request (a JSON object). Same steps as the PowerShell remoting path.
$clientIp = [string]$arg.clientIp; $winrmPort = [int]$arg.winrmPort
$state = [ordered]@{ serviceRunning = $false; serviceStartMode = ''; ruleChanged = $false; ruleRemote = @(); createdRule = $false }
$out = [ordered]@{ ok = $true; error = ''; outDir = ''; allowed = @(); state = $state }
try {
    # Who the firewall rule lets in: the address the host sees this server's WinRM connection coming from. That can differ from the
    # server's own address behind NAT or a VPN, so it is read from the live connection; the server's own address is the fallback.
    $seen = @(Get-NetTCPConnection -LocalPort $winrmPort -State Established -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.RemoteAddress } | Where-Object { $_ -and $_ -notin '127.0.0.1', '::1' } | Select-Object -Unique)
    $allow = if ($seen -contains $clientIp -or -not $seen.Count) { @($clientIp) } else { $seen }
    $out.allowed = $allow
    $svc = Get-CimInstance Win32_Service -Filter "Name='LanmanServer'"
    $state.serviceRunning = ($svc.State -eq 'Running'); $state.serviceStartMode = [string]$svc.StartMode
    $rule = Get-NetFirewallRule -Name 'FPS-SMB-In-TCP' -ErrorAction SilentlyContinue
    if ($svc.StartMode -eq 'Disabled') { Set-Service LanmanServer -StartupType Manual }
    if ($svc.State -ne 'Running') { Start-Service LanmanServer }
    if (-not $rule) {
        New-NetFirewallRule -Name 'KB-SMB-Temp' -DisplayName 'Kookaburrow SMB (temporary)' -Direction Inbound -Protocol TCP -LocalPort 445 -RemoteAddress $allow -Action Allow | Out-Null
        $state.createdRule = $true
    } elseif ($rule.Enabled -ne 'True') {
        $state.ruleRemote = @((Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $rule).RemoteAddress | ForEach-Object { [string]$_ })
        $state.ruleChanged = $true
        Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -RemoteAddress $allow
        Set-NetFirewallRule -Name 'FPS-SMB-In-TCP' -Enabled True
    }
    $d = Join-Path ([System.IO.Path]::GetTempPath()) ('kb-out-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $d -Force | Out-Null
    $out.outDir = $d
} catch { $out.ok = $false; $out.error = $_.Exception.Message }
ConvertTo-Json -InputObject $out -Depth 4 -Compress
