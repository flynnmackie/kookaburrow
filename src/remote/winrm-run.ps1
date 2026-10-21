# Wrapper executed by winrm.js. Credentials and targets arrive via environment variables
# (never the command line). Runs either a local .ps1 file or a short inline probe on the target.
$ErrorActionPreference = 'Stop'
$sec  = ConvertTo-SecureString $env:KB_PASS -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($env:KB_USER, $sec)
$p = @{
    ComputerName   = $env:KB_HOST
    Port           = [int]$env:KB_PORT
    Credential     = $cred
    Authentication = $env:KB_AUTH
}
# Fail within ~20 s when a host does not answer instead of waiting minutes. Self-signed HTTPS certificates are accepted.
$opt = @{ OpenTimeout = 20000 }
if ($env:KB_SSL -eq '1') { $p.UseSSL = $true; $opt.SkipCACheck = $true; $opt.SkipCNCheck = $true }
$p.SessionOption = New-PSSessionOption @opt

# CSV mode (hunts): the collection runs on the target with Format-Table/Format-List turned into pass-throughs, so what
# comes back are the objects themselves, written as CSV. If the collection also prints plain text (section headings,
# notes) the whole output is returned as a one-column CSV (Output) so the result is always valid CSV.
$csv = $env:KB_CSV -eq '1'
if ($csv) {
    $body = Get-Content -LiteralPath $env:KB_SCRIPT -Raw
    $wrapper = {
        param($body)
        function Format-Table { $input }
        function Format-List { $input }
        $items = @(& ([scriptblock]::Create($body)))
        $text = @($items | Where-Object { $_ -is [string] })
        if ($items.Count -gt 0 -and $text.Count -eq 0) { $items | ConvertTo-Csv -NoTypeInformation }
        else { $items | ForEach-Object { [pscustomobject]@{ Output = ([string]$_).TrimEnd() } } | ConvertTo-Csv -NoTypeInformation }
    }
}

if ($env:KB_MODE -eq 'probe') {
    $p.ScriptBlock = {
        $o = Get-CimInstance Win32_OperatingSystem
        [pscustomobject]@{ hostname = $env:COMPUTERNAME; os = $o.Caption; version = $o.Version } | ConvertTo-Json -Compress
    }
    Invoke-Command @p | Out-String
} elseif ($env:KB_MODE -eq 'smb-open') {
    # Large transfers, step 1: make sure SMB is reachable from the Kookaburrow server and create the folder the collection writes to.
    # The service and the "File and Printer Sharing (SMB-In)" firewall rule are only touched when they are off, and what they were is
    # returned so smb-close can put it back exactly. A rule that is already on is left alone (other people may be using the shares).
    $arg = $env:KB_ARG | ConvertFrom-Json
    $p.ScriptBlock = {
        param($clientIp, $winrmPort)
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
    }
    $p.ArgumentList = @($arg.clientIp, [int]$arg.winrmPort)
    Invoke-Command @p | Out-String
} elseif ($env:KB_MODE -eq 'smb-list') {
    # Large transfers, step 3: every file the collection left in its folder, with size and SHA-256 (what the server checks the copy against).
    $arg = $env:KB_ARG | ConvertFrom-Json
    $p.ScriptBlock = {
        param($outDir)
        $files = @()
        if (Test-Path -LiteralPath $outDir) {
            $base = (Get-Item -LiteralPath $outDir).FullName.TrimEnd('\')
            $files = @(Get-ChildItem -LiteralPath $outDir -Recurse -File -Force | ForEach-Object {
                [pscustomobject]@{ path = $_.FullName.Substring($base.Length + 1); size = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower() } })
        }
        ConvertTo-Json -InputObject $files -Compress
    }
    $p.ArgumentList = @($arg.outDir)
    Invoke-Command @p | Out-String
} elseif ($env:KB_MODE -eq 'smb-close') {
    # Large transfers, last step: remove the folder (only when every file was copied and checked), put the SMB service and firewall rule
    # back as they were, and report what is in place now so the server can confirm it.
    $arg = $env:KB_ARG | ConvertFrom-Json
    $p.ScriptBlock = {
        param($outDir, $state, $removeDir)
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
    }
    $p.ArgumentList = @($arg.outDir, $arg.state, [bool]$arg.removeDir)
    Invoke-Command @p | Out-String
} elseif (-not $env:KB_BINS -and -not $env:KB_OUTDIR) {
    if ($csv) { Invoke-Command @p -ScriptBlock $wrapper -ArgumentList $body | Out-String -Width 8192 }
    else { $p.FilePath = $env:KB_SCRIPT; Invoke-Command @p | Out-String -Width 4096 }
} else {
    # The collection needs binaries: stage them in a temp folder on the target, expose it to the collection
    # as $BinDir, run the collection, then always delete the folder and close the session.
    $bins = if ($env:KB_BINS) { @($env:KB_BINS | ConvertFrom-Json) } else { @() }
    $session = New-PSSession @p
    $dir = $null
    try {
        $dir = [string](Invoke-Command -Session $session -ScriptBlock {
            $d = Join-Path ([System.IO.Path]::GetTempPath()) ('kb-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $d -Force | Out-Null
            $d
        })
        foreach ($b in @($bins)) { Copy-Item -LiteralPath $b -Destination $dir -ToSession $session -Force }
        Invoke-Command -Session $session -ScriptBlock { param($d) $global:BinDir = $d } -ArgumentList $dir
        # Large-transfer collections: the folder the script writes its files to (the server pulls it afterwards and removes it)
        if ($env:KB_OUTDIR) { Invoke-Command -Session $session -ScriptBlock { param($d) $global:OutDir = $d } -ArgumentList $env:KB_OUTDIR }
        if ($csv) { Invoke-Command -Session $session -ScriptBlock $wrapper -ArgumentList $body | Out-String -Width 8192 }
        else { Invoke-Command -Session $session -FilePath $env:KB_SCRIPT | Out-String -Width 4096 }
    } finally {
        if ($dir -and $dir -like '*\kb-*') {
            Invoke-Command -Session $session -ScriptBlock { param($d) Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $dir
        }
        Remove-PSSession $session -ErrorAction SilentlyContinue
    }
}
