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
if ($env:KB_SSL -eq '1') { $p.UseSSL = $true }

if ($env:KB_MODE -eq 'probe') {
    $p.ScriptBlock = {
        $o = Get-CimInstance Win32_OperatingSystem
        [pscustomobject]@{ hostname = $env:COMPUTERNAME; os = $o.Caption; version = $o.Version } | ConvertTo-Json -Compress
    }
    Invoke-Command @p | Out-String
} elseif (-not $env:KB_BINS) {
    $p.FilePath = $env:KB_SCRIPT
    Invoke-Command @p | Out-String -Width 4096
} else {
    # The hunt needs binaries: stage them in a temp folder on the target, expose it to the hunt
    # as $BinDir, run the hunt, then always delete the folder and close the session.
    $bins = @($env:KB_BINS | ConvertFrom-Json)
    $session = New-PSSession @p
    $dir = $null
    try {
        $dir = [string](Invoke-Command -Session $session -ScriptBlock {
            $d = Join-Path ([System.IO.Path]::GetTempPath()) ('kb-' + [guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $d -Force | Out-Null
            $d
        })
        foreach ($b in $bins) { Copy-Item -LiteralPath $b -Destination $dir -ToSession $session -Force }
        Invoke-Command -Session $session -ScriptBlock { param($d) $global:BinDir = $d } -ArgumentList $dir
        Invoke-Command -Session $session -FilePath $env:KB_SCRIPT | Out-String -Width 4096
    } finally {
        if ($dir -and $dir -like '*\kb-*') {
            Invoke-Command -Session $session -ScriptBlock { param($d) Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $dir
        }
        Remove-PSSession $session -ErrorAction SilentlyContinue
    }
}
